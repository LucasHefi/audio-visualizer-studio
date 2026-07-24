import { describe, expect, it } from 'vitest';
import { CANVAS_PROFILES, PALETTES } from '../core/catalog';
import { SCENE_REGISTRY } from '../visualizer/sceneModules';
import type { SceneSettings } from '../types';
import { createFrozenExportSnapshot, toStructuredCloneableExportRender } from './snapshot';
import type { ExportRequest } from './types';

const request: ExportRequest = {
  profileId: 'youtube-landscape',
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 1,
  seed: 101,
  audio: { name: 'demo.mp3', size: 1024, lastModified: 1_700_000_000_000 },
};

const settings = (energy: number): SceneSettings => ({
  energy,
  sensitivity: 0.5,
  motion: 0.5,
  density: 0.5,
  glow: 0.5,
  background: 0.5,
});

describe('frozen export snapshot', () => {
  it('captures every active layer in order with its own scene, settings, palette and seed', () => {
    const spectrum = SCENE_REGISTRY.require('spectrum');
    const waveform = SCENE_REGISTRY.require('waveform');
    const snapshot = createFrozenExportSnapshot({
      request,
      profile: CANVAS_PROFILES['youtube-landscape'],
      layers: [
        { id: 'layer-spectrum', module: spectrum, palette: PALETTES.emerald, settings: settings(0.2), seed: 11 },
        { id: 'layer-waveform', module: waveform, palette: PALETTES.ruby, settings: settings(0.9), seed: 22 },
      ],
      reducedMotion: false,
      quality: 'balanced',
    });

    expect(snapshot.render.layers.map((layer) => ({
      id: layer.id,
      sceneId: layer.sceneId,
      paletteId: layer.palette.id,
      energy: layer.settings.energy,
      seed: layer.seed,
    }))).toEqual([
      { id: 'layer-spectrum', sceneId: 'spectrum', paletteId: 'emerald', energy: 0.2, seed: 11 },
      { id: 'layer-waveform', sceneId: 'waveform', paletteId: 'ruby', energy: 0.9, seed: 22 },
    ]);
    expect(Object.isFrozen(snapshot.render.layers)).toBe(true);
    expect(Object.isFrozen(snapshot.render.layers[0])).toBe(true);
    const wireRender = toStructuredCloneableExportRender(snapshot.render);
    expect(wireRender.layers.map((layer) => layer.id)).toEqual(['layer-spectrum', 'layer-waveform']);
    expect(wireRender.layers[0]).not.toHaveProperty('module');
  });
});
