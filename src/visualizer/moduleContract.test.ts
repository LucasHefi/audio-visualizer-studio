import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCENE_SETTINGS_SCHEMA, migrateSettings, validateSettings } from '../core/settingsSchema';
import type { Canvas2DSceneModule, ModuleLifecycle, ModuleManifest, SceneId, SceneManifest, SceneModule, SceneSettings, WebGL2ModuleCreateContext, WebGL2ModuleUpdateInput } from '../types';
import { ModuleContractError, RendererBackendMismatchError, SceneModuleRegistry } from './moduleContract';

const makeManifest = (id: SceneId, entitlement: ModuleManifest['entitlement'] = 'core'): SceneManifest & { backend: 'canvas2d' } => ({
  id,
  kind: 'visualizer',
  apiVersion: 1,
  backend: 'canvas2d',
  version: '1.0.0',
  name: id,
  description: 'test module',
  tags: ['test'],
  capabilities: ['audio-frame', 'canvas', 'settings'],
  entitlement,
  settingsSchema: SCENE_SETTINGS_SCHEMA,
});

const makeModule = (id: 'spectrum' | 'waveform', counters: { created: number; destroyed: number; updates: number }): Canvas2DSceneModule => ({
  manifest: makeManifest(id),
  defaults: { energy: 0.5, sensitivity: 0.5, motion: 0.5, density: 0.5, glow: 0.5, background: 0.5 },
  render: () => counters.updates += 1,
  create: () => {
    counters.created += 1;
    let destroyed = false;
    const lifecycle: ModuleLifecycle = {
      update: () => { if (destroyed) throw new Error('updated after destroy'); counters.updates += 1; },
      resize: () => undefined,
      setQuality: () => undefined,
      setReducedMotion: () => undefined,
      destroy: () => { destroyed = true; counters.destroyed += 1; },
    };
    return lifecycle;
  },
});

describe('module contract and registry', () => {
  it('rejects unknown and unavailable modules instead of falling back', () => {
    const paid = { ...makeModule('waveform', { created: 0, destroyed: 0, updates: 0 }), manifest: makeManifest('waveform', 'paid') };
    const registry = new SceneModuleRegistry([makeModule('spectrum', { created: 0, destroyed: 0, updates: 0 }), paid]);
    expect(() => registry.require('missing')).toThrow(ModuleContractError);
    expect(() => registry.require('waveform')).toThrow('requires the paid entitlement');
    expect(registry.list().map((module) => module.manifest.id)).toEqual(['spectrum']);
  });

  it('rejects malformed manifests with a contract error', () => {
    const malformed = { ...makeModule('spectrum', { created: 0, destroyed: 0, updates: 0 }), manifest: { ...makeManifest('spectrum'), settingsSchema: undefined } as unknown as Canvas2DSceneModule['manifest'] };
    expect(() => new SceneModuleRegistry([malformed])).toThrow(ModuleContractError);
  });

  it('requires an explicit backend instead of silently reinterpreting API version 1', () => {
    const legacy = {
      ...makeModule('spectrum', { created: 0, destroyed: 0, updates: 0 }),
      manifest: { ...makeManifest('spectrum'), backend: undefined },
    } as unknown as SceneModule;

    expect(() => new SceneModuleRegistry([legacy])).toThrow('backend');
  });

  it('represents a WebGL2 module with a typed WebGL context and rejects a Canvas2D mismatch', () => {
    let receivedGl: WebGL2RenderingContext | undefined;
    const module: SceneModule = {
      manifest: {
        ...makeManifest('cosmic-kaleidoscope'),
        id: 'cosmic-kaleidoscope',
        backend: 'webgl2',
      },
      defaults: { energy: 0.5, sensitivity: 0.5, motion: 0.5, density: 0.5, glow: 0.5, background: 0.5 },
      create: ({ backend, gl }: WebGL2ModuleCreateContext) => {
        if (backend !== 'webgl2') throw new Error('unexpected backend');
        receivedGl = gl;
        const lifecycle: ModuleLifecycle<WebGL2ModuleUpdateInput> = {
          update: (input) => input.gl.clear(input.gl.COLOR_BUFFER_BIT),
          resize: () => undefined,
          setQuality: () => undefined,
          setReducedMotion: () => undefined,
          destroy: () => undefined,
        };
        return lifecycle;
      },
    };
    const registry = new SceneModuleRegistry([module]);
    const canvas = {} as HTMLCanvasElement;
    const gl = { COLOR_BUFFER_BIT: 0x4000, clear: () => undefined } as unknown as WebGL2RenderingContext;

    expect(() => registry.create('cosmic-kaleidoscope', {
      backend: 'canvas2d',
      canvas,
      ctx: {} as CanvasRenderingContext2D,
    })).toThrow(RendererBackendMismatchError);

    const lifecycle = registry.create('cosmic-kaleidoscope', { backend: 'webgl2', canvas, gl });
    lifecycle.update({
      backend: 'webgl2',
      gl,
      width: 640,
      height: 360,
      frame: { frequencyBins: [], waveform: [], bassEnergy: 0, midEnergy: 0, trebleEnergy: 0, volume: 0, beatPulse: 0 },
      settings: { energy: 0.5, sensitivity: 0.5, motion: 0.5, density: 0.5, glow: 0.5, background: 0.5 },
      palette: {} as never,
      elapsed: 0,
      seed: 1,
      quality: 'high',
      reducedMotion: false,
    });
    expect(receivedGl).toBe(gl);
  });

  it('keeps built-in module source free of forbidden app/runtime dependencies', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/visualizer/sceneModules.ts'), 'utf8');
    expect(source).not.toMatch(/from ['"](?:\.\.\/audio|react|zustand)/);
    expect(source).not.toMatch(/\b(?:window|document|AudioContext|fetch)\b/);
  });

  it('creates and destroys each active instance exactly once during a switch', () => {
    const first = { created: 0, destroyed: 0, updates: 0 };
    const second = { created: 0, destroyed: 0, updates: 0 };
    const registry = new SceneModuleRegistry([makeModule('spectrum', first), makeModule('waveform', second)]);
    const context = { canvas: {} as HTMLCanvasElement, ctx: {} as CanvasRenderingContext2D };
    const firstInstance = registry.create('spectrum', context);
    firstInstance.update({
      ctx: context.ctx,
      width: 640,
      height: 360,
      frame: { frequencyBins: [], waveform: [], bassEnergy: 0, midEnergy: 0, trebleEnergy: 0, volume: 0, beatPulse: 0 },
      settings: { energy: 0.5, sensitivity: 0.5, motion: 0.5, density: 0.5, glow: 0.5, background: 0.5 },
      palette: {} as never,
      elapsed: 0,
      seed: 1,
      quality: 'high',
      reducedMotion: false,
    });
    firstInstance.destroy();
    const secondInstance = registry.create('waveform', context);
    secondInstance.destroy();
    expect(first).toEqual({ created: 1, destroyed: 1, updates: 1 });
    expect(second).toEqual({ created: 1, destroyed: 1, updates: 0 });
  });

  it('covers resize, quality, reduced-motion and destroy for the render adapter', () => {
    let renderedSettings: SceneSettings | undefined;
    const module: SceneModule = {
      manifest: makeManifest('spectrum'),
      defaults: { energy: 0.5, sensitivity: 0.5, motion: 0.5, density: 0.5, glow: 0.5, background: 0.5 },
      render: (_ctx, _width, _height, _frame, settings) => { renderedSettings = settings; },
    };
    const registry = new SceneModuleRegistry([module]);
    const context = { canvas: {} as HTMLCanvasElement, ctx: {} as CanvasRenderingContext2D };
    const instance = registry.create('spectrum', context);
    instance.resize({ width: 640, height: 360, devicePixelRatio: 1 });
    instance.setQuality('low');
    instance.setReducedMotion(true);
    instance.update({
      ctx: context.ctx,
      width: 640,
      height: 360,
      frame: { frequencyBins: [], waveform: [], bassEnergy: 0, midEnergy: 0, trebleEnergy: 0, volume: 0, beatPulse: 0 },
      settings: { energy: 0.5, sensitivity: 0.5, motion: 0.8, density: 0.5, glow: 0.5, background: 0.5 },
      palette: {} as never,
      elapsed: 0,
      seed: 1,
      quality: 'low',
      reducedMotion: true,
    });
    expect(renderedSettings?.motion).toBe(0);
    instance.destroy();
    expect(() => instance.resize({ width: 640, height: 360, devicePixelRatio: 1 })).toThrow(ModuleContractError);
  });
});

describe('generic settings schema', () => {
  it('clamps invalid numeric values and reports the correction', () => {
    const result = validateSettings(SCENE_SETTINGS_SCHEMA, { energy: 2, motion: 'fast' });
    expect(result.value.energy).toBe(1);
    expect(result.value.motion).toBe(0.52);
    expect(result.errors).toHaveLength(2);
  });

  it('keeps a migration hook as an explicit versioned seam', () => {
    const schema = { ...SCENE_SETTINGS_SCHEMA, version: 2, migrate: (value: unknown) => ({ ...(value as object), glow: 0.9 }) };
    expect(migrateSettings(schema, { energy: 0.2 }, 1)).toEqual({ energy: 0.2, glow: 0.9 });
  });
});
