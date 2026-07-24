import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SCENE_SETTINGS, DEFAULT_LAYER_ID, migrateProject, normalizeProjectState, randomizeSettings, useProjectStore } from './projectStore';
import { SCENE_MODULES } from '../visualizer/sceneModules';

beforeEach(() => {
  useProjectStore.setState(normalizeProjectState({}));
});

describe('project store', () => {
  it('changes only the selected layer settings', () => {
    useProjectStore.getState().setSceneSetting('glow', 0.95);
    expect(useProjectStore.getState().sceneSettings.spectrum.glow).toBe(0.95);
    expect(useProjectStore.getState().sceneSettings.waveform).toEqual(SCENE_MODULES.waveform.defaults);
  });

  it('switches profiles and palettes through the public contract', () => {
    useProjectStore.getState().setProfile('tiktok-portrait');
    useProjectStore.getState().setPalette('emerald');
    expect(useProjectStore.getState().profileId).toBe('tiktok-portrait');
    expect(useProjectStore.getState().paletteId).toBe('emerald');
    expect(useProjectStore.getState().visualLayers[0].paletteId).toBe('emerald');
  });

  it('changes palettes only for the addressed layer and mirrors the selected layer', () => {
    const store = useProjectStore.getState();
    store.selectScene('waveform');
    const waveformId = useProjectStore.getState().selectedLayerId;

    store.setLayerPalette(waveformId, 'ruby');
    expect(useProjectStore.getState().visualLayers.find((layer) => layer.id === waveformId)?.paletteId).toBe('ruby');
    expect(useProjectStore.getState().paletteId).toBe('ruby');

    store.setLayerPalette(DEFAULT_LAYER_ID, 'emerald');
    expect(useProjectStore.getState().visualLayers.find((layer) => layer.id === DEFAULT_LAYER_ID)?.paletteId).toBe('emerald');
    expect(useProjectStore.getState().visualLayers.find((layer) => layer.id === waveformId)?.paletteId).toBe('ruby');
    expect(useProjectStore.getState().paletteId).toBe('ruby');
  });
  it('migrates removed 3D Spectrum state to the supported Spectrum scene', () => {
    const migrated = migrateProject({
      activeSceneId: '3d-spectrum',
      visualLayers: [{ id: 'legacy-layer', sceneId: '3d-spectrum', enabled: true, settings: DEFAULT_SCENE_SETTINGS, paletteId: 'ruby', seed: 9 }],
    });
    expect(migrated.activeSceneId).toBe('spectrum');
    expect(migrated.visualLayers[0]).toMatchObject({ sceneId: 'spectrum', enabled: true, paletteId: 'ruby', seed: 9 });
    expect(migrateProject({ profileId: 'feed' }).profileId).toBe('instagram-square');
    expect(migrateProject({ profileId: 'unknown-profile' }).profileId).toBe('youtube-landscape');
  });

  it('backfills all new scene settings and a single legacy active layer', () => {
    const migrated = migrateProject({
      activeSceneId: 'spectrum',
      sceneSettings: {
        spectrum: { ...DEFAULT_SCENE_SETTINGS, glow: 0.8 },
        waveform: { ...DEFAULT_SCENE_SETTINGS },
        orbital: { ...DEFAULT_SCENE_SETTINGS },
        'fluid-glow': { ...DEFAULT_SCENE_SETTINGS },
      },
    });

    expect(migrated.sceneSettings['cosmic-kaleidoscope']).toEqual(SCENE_MODULES['cosmic-kaleidoscope'].defaults);
    expect(migrated.sceneSettings['layered-circles']).toEqual(SCENE_MODULES['layered-circles'].defaults);
    expect(migrated.visualLayers).toHaveLength(1);
    expect(migrated.visualLayers[0]).toMatchObject({ sceneId: 'spectrum', enabled: true });
  });

  it('normalizes same-version partial persisted state before a renderer can consume it', () => {
    const normalized = normalizeProjectState({
      activeSceneId: 'cosmic-kaleidoscope',
      paletteId: 'deleted-palette',
      sceneSettings: {
        spectrum: { ...DEFAULT_SCENE_SETTINGS, background: 0.8 },
      },
    });

    expect(normalized.activeSceneId).toBe('cosmic-kaleidoscope');
    expect(normalized.paletteId).toBe('aurora');
    expect(normalized.sceneSettings['cosmic-kaleidoscope']).toEqual(SCENE_MODULES['cosmic-kaleidoscope'].defaults);
    expect(normalized.sceneSettings.spectrum.background).toBe(0.8);
    expect(normalized.visualLayers[0]).toMatchObject({ sceneId: 'cosmic-kaleidoscope', paletteId: 'aurora', enabled: true });
  });

  it('keeps card selection separate from activation and caps active layers at three', () => {
    const store = useProjectStore.getState();
    store.selectScene('waveform');
    store.toggleScene('waveform');
    store.selectScene('orbital');
    store.toggleScene('orbital');
    store.selectScene('layered-circles');
    store.toggleScene('layered-circles');
    store.selectScene('fluid-glow');
    expect(useProjectStore.getState().visualLayers.filter((layer) => layer.enabled)).toHaveLength(3);
    expect(useProjectStore.getState().visualLayers.find((layer) => layer.sceneId === 'fluid-glow')?.enabled).toBe(false);

    const before = useProjectStore.getState().visualLayers.find((layer) => layer.sceneId === 'waveform');
    store.selectScene('layered-circles');
    store.setSceneSetting('energy', 0.11);
    const after = useProjectStore.getState().visualLayers.find((layer) => layer.sceneId === 'waveform');
    expect(after?.settings).toEqual(before?.settings);
    expect(useProjectStore.getState().visualLayers.find((layer) => layer.sceneId === 'layered-circles')?.settings.energy).toBe(0.11);
  });

  it('resets and randomizes only the selected layer within schema bounds', () => {
    const store = useProjectStore.getState();
    store.selectScene('layered-circles');
    store.toggleScene('layered-circles');
    store.setSceneSetting('energy', 0.02);
    store.randomizeScene();
    const layer = useProjectStore.getState().visualLayers.find((candidate) => candidate.sceneId === 'layered-circles');
    expect(layer?.settings.energy).toBeGreaterThanOrEqual(0);
    expect(layer?.settings.energy).toBeLessThanOrEqual(1);
    store.resetScene();
    expect(useProjectStore.getState().visualLayers.find((candidate) => candidate.sceneId === 'layered-circles')?.settings).toEqual(SCENE_MODULES['layered-circles'].defaults);
  });

  it('randomizes every schema field independently within its bounds', () => {
    const randomized = randomizeSettings(DEFAULT_SCENE_SETTINGS, 1407);
    const values = Object.values(randomized);
    expect(values.every((value) => value >= 0 && value <= 1)).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(3);
  });
});
