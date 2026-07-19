import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENE_SETTINGS, useProjectStore } from './projectStore';

describe('project store', () => {
  it('changes only the active scene settings', () => {
    useProjectStore.setState({ activeSceneId: 'spectrum' });
    useProjectStore.getState().setSceneSetting('glow', 0.95);
    expect(useProjectStore.getState().sceneSettings.spectrum.glow).toBe(0.95);
    expect(useProjectStore.getState().sceneSettings.waveform).toEqual(DEFAULT_SCENE_SETTINGS);
  });

  it('switches profiles and palettes through the public contract', () => {
    useProjectStore.getState().setProfile('vertical');
    useProjectStore.getState().setPalette('ember');
    expect(useProjectStore.getState().profileId).toBe('vertical');
    expect(useProjectStore.getState().paletteId).toBe('ember');
  });
});
