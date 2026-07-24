import { describe, expect, it, vi } from 'vitest';
import { SCENE_SETTINGS_SCHEMA } from '../core/settingsSchema';
import { createSilentFrame } from '../core/audioMath';
import { PALETTES } from '../core/catalog';
import type { ModuleLifecycle, SceneModule, SceneSettings } from '../types';
import { CanvasRuntime } from './CanvasRuntime';
import { SceneModuleRegistry } from './moduleContract';

const makeTestModule = (id: 'spectrum' | 'waveform', counters: { created: number; destroyed: number }): SceneModule => ({
  manifest: {
    id,
    kind: 'visualizer',
    apiVersion: 1,
    backend: 'canvas2d',
    version: '1.0.0',
    name: id,
    description: 'runtime test module',
    tags: ['test'],
    capabilities: ['audio-frame', 'canvas', 'settings'],
    entitlement: 'core',
    settingsSchema: SCENE_SETTINGS_SCHEMA,
  },
  defaults: { energy: 0.5, sensitivity: 0.5, motion: 0.5, density: 0.5, glow: 0.5, background: 0.5 },
  render: () => undefined,
  create: (): ModuleLifecycle => {
    counters.created += 1;
    let destroyed = false;
    return {
      update: () => { if (destroyed) throw new Error('update after destroy'); },
      resize: () => { if (destroyed) throw new Error('resize after destroy'); },
      setQuality: () => undefined,
      setReducedMotion: () => undefined,
      destroy: () => { if (!destroyed) { destroyed = true; counters.destroyed += 1; } },
    };
  },
});

describe('CanvasRuntime lifecycle harness', () => {
  it('switches modules and cancels the pending RAF on destroy', () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextHandle = 1;
    let cancelCount = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    });
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
      cancelCount += 1;
      callbacks.delete(handle);
    });

    const first = { created: 0, destroyed: 0 };
    const second = { created: 0, destroyed: 0 };
    const registry = new SceneModuleRegistry([makeTestModule('spectrum', first), makeTestModule('waveform', second)]);
    const context = { setTransform: vi.fn() } as unknown as CanvasRenderingContext2D;
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
      getBoundingClientRect: () => ({ width: 640, height: 360 }),
    } as unknown as HTMLCanvasElement;
    let activeScene: 'spectrum' | 'waveform' = 'spectrum';
    const runtime = new CanvasRuntime({
      canvas,
      registry,
      getFrame: () => createSilentFrame(),
      getSceneId: () => activeScene,
      getSettings: () => ({ energy: 0.5, sensitivity: 0.5, motion: 0.5, density: 0.5, glow: 0.5, background: 0.5 }),
      getPalette: () => PALETTES.aurora,
      getSeed: () => 1,
    });

    const runNextFrame = () => {
      const next = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
      if (!next) throw new Error('expected a scheduled animation frame');
      callbacks.delete(next[0]);
      next[1](16);
    };

    runtime.start();
    runNextFrame();
    expect(first).toEqual({ created: 1, destroyed: 0 });
    activeScene = 'waveform';
    runNextFrame();
    expect(first).toEqual({ created: 1, destroyed: 1 });
    expect(second).toEqual({ created: 1, destroyed: 0 });
    runtime.destroy();
    expect(second).toEqual({ created: 1, destroyed: 1 });
    expect(callbacks.size).toBe(0);
    expect(cancelCount).toBe(1);
    vi.unstubAllGlobals();
  });

  it('reports an explicit backend mismatch instead of falling back to Canvas2D', () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const handle = callbacks.size + 1;
      callbacks.set(handle, callback);
      return handle;
    });
    const webglModule: SceneModule = {
      manifest: {
        id: 'cosmic-kaleidoscope',
        kind: 'visualizer',
        apiVersion: 1,
        backend: 'webgl2',
        version: '1.0.0',
        name: 'Cosmic Kaleidoscope',
        description: 'WebGL2 test module',
        tags: ['test'],
        capabilities: ['audio-frame', 'canvas', 'settings'],
        entitlement: 'core',
        settingsSchema: SCENE_SETTINGS_SCHEMA,
      },
      defaults: { energy: 0.5, sensitivity: 0.5, motion: 0.5, density: 0.5, glow: 0.5, background: 0.5 },
      create: () => ({
        update: () => undefined,
        resize: () => undefined,
        setQuality: () => undefined,
        setReducedMotion: () => undefined,
        destroy: () => undefined,
      }),
    };
    const registry = new SceneModuleRegistry([webglModule]);
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ setTransform: vi.fn() }),
      getBoundingClientRect: () => ({ width: 640, height: 360 }),
    } as unknown as HTMLCanvasElement;
    const onError = vi.fn();
    const runtime = new CanvasRuntime({
      canvas,
      registry,
      getFrame: () => createSilentFrame(),
      getSceneId: () => 'cosmic-kaleidoscope',
      getSettings: () => ({ energy: 0.5, sensitivity: 0.5, motion: 0.5, density: 0.5, glow: 0.5, background: 0.5 }),
      getPalette: () => PALETTES.aurora,
      getSeed: () => 1,
      onError,
    });

    runtime.start();

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].message).toMatch(/backend mismatch/i);
    expect(callbacks.size).toBe(0);
    vi.unstubAllGlobals();
  });
});
