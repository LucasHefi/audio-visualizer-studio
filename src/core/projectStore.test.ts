import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENE_SETTINGS, migrateProject, useProjectStore } from './projectStore';

describe('project store', () => {
  it('changes only the active scene settings', () => {
    useProjectStore.setState({ activeSceneId: 'spectrum' });
    useProjectStore.getState().setSceneSetting('glow', 0.95);
    expect(useProjectStore.getState().sceneSettings.spectrum.glow).toBe(0.95);
    expect(useProjectStore.getState().sceneSettings.waveform).toEqual(DEFAULT_SCENE_SETTINGS);
  });

  it('switches profiles and palettes through the public contract', () => {
    useProjectStore.getState().setProfile('tiktok-portrait');
    useProjectStore.getState().setPalette('ember');
    expect(useProjectStore.getState().profileId).toBe('tiktok-portrait');
    expect(useProjectStore.getState().paletteId).toBe('ember');
  });

  it('migrates legacy profiles and invalid state to the explicit platform catalog', () => {
    expect(migrateProject({ profileId: 'feed' }).profileId).toBe('instagram-square');
    expect(migrateProject({ profileId: 'unknown-profile' }).profileId).toBe('youtube-landscape');
  });
});
