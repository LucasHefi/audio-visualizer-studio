import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCENE_SETTINGS_SCHEMA, migrateSettings, validateSettings } from '../core/settingsSchema';
import type { ModuleLifecycle, ModuleManifest, SceneModule, SceneSettings } from '../types';
import { ModuleContractError, SceneModuleRegistry } from './moduleContract';

const makeManifest = (id: string, entitlement: ModuleManifest['entitlement'] = 'core'): ModuleManifest => ({
  id,
  kind: 'visualizer',
  apiVersion: 1,
  version: '1.0.0',
  name: id,
  description: 'test module',
  tags: ['test'],
  capabilities: ['audio-frame', 'canvas', 'settings'],
  entitlement,
  settingsSchema: SCENE_SETTINGS_SCHEMA,
});

const makeModule = (id: 'spectrum' | 'waveform', counters: { created: number; destroyed: number; updates: number }): SceneModule => ({
  manifest: makeManifest(id) as SceneModule['manifest'],
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
    const paid = { ...makeModule('waveform', { created: 0, destroyed: 0, updates: 0 }), manifest: makeManifest('waveform', 'paid') as SceneModule['manifest'] };
    const registry = new SceneModuleRegistry([makeModule('spectrum', { created: 0, destroyed: 0, updates: 0 }), paid]);
    expect(() => registry.require('missing')).toThrow(ModuleContractError);
    expect(() => registry.require('waveform')).toThrow('requires the paid entitlement');
    expect(registry.list().map((module) => module.manifest.id)).toEqual(['spectrum']);
  });

  it('rejects malformed manifests with a contract error', () => {
    const malformed = { ...makeModule('spectrum', { created: 0, destroyed: 0, updates: 0 }), manifest: { ...makeManifest('spectrum'), settingsSchema: undefined } as unknown as SceneModule['manifest'] };
    expect(() => new SceneModuleRegistry([malformed])).toThrow(ModuleContractError);
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
      manifest: makeManifest('spectrum') as SceneModule['manifest'],
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
