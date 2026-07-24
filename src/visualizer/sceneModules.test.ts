import { describe, expect, it } from 'vitest';
import { SCENE_MODULES, SCENE_REGISTRY } from './sceneModules';
import { RendererBackendMismatchError } from './moduleContract';

describe('scene module registry', () => {
  it('keeps the Canvas2D scenes and exposes Cosmic Kaleidoscope as WebGL2', () => {
    expect(Object.keys(SCENE_MODULES)).toEqual([
      'spectrum',
      'waveform',
      'orbital',
      'fluid-glow',
      'cosmic-kaleidoscope',
      'layered-circles',
    ]);
    const cosmic = SCENE_REGISTRY.require('cosmic-kaleidoscope');
    expect(cosmic.manifest.backend).toBe('webgl2');
    expect(cosmic.manifest.id).toBe('cosmic-kaleidoscope');
    expect(cosmic.manifest.entitlement).toBe('core');
    expect(cosmic.manifest.settingsSchema.version).toBe(1);
  });

  it('rejects a Canvas2D context for the WebGL2 scene instead of falling back', () => {
    expect(() => SCENE_REGISTRY.create('cosmic-kaleidoscope', {
      backend: 'canvas2d',
      canvas: {} as HTMLCanvasElement,
      ctx: {} as CanvasRenderingContext2D,
    })).toThrowError(RendererBackendMismatchError);
  });
});
