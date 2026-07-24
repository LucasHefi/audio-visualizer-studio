import { describe, expect, it } from 'vitest';
import { SCENE_REGISTRY } from './sceneModules';

describe('removed 3D Spectrum module', () => {
  it('is no longer available in the runtime scene registry', () => {
    expect(() => SCENE_REGISTRY.require('3d-spectrum')).toThrow();
  });
});
