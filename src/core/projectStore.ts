import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CanvasProfileId, PaletteId, SceneId, SceneSettings, StoredProjectState } from '../types';

export const DEFAULT_SCENE_SETTINGS: SceneSettings = {
  energy: 0.72,
  sensitivity: 0.68,
  motion: 0.52,
  density: 0.58,
  glow: 0.7,
  background: 0.45,
};

const sceneIds: SceneId[] = ['spectrum', 'waveform', 'orbital', 'fluid-glow'];
const paletteIds: PaletteId[] = ['aurora', 'ember', 'mono', 'ocean'];
const profileIds: CanvasProfileId[] = ['wide', 'vertical', 'feed', '18-9'];

const defaultSettings = (): Record<SceneId, SceneSettings> =>
  Object.fromEntries(sceneIds.map((id) => [id, { ...DEFAULT_SCENE_SETTINGS }])) as Record<SceneId, SceneSettings>;

const DEFAULT_PROJECT: StoredProjectState = {
  projectName: 'Untitled visual study',
  activeSceneId: 'spectrum',
  sceneSettings: defaultSettings(),
  paletteId: 'aurora',
  profileId: 'wide',
  seed: 1407,
};

const migrateProject = (persisted: unknown): StoredProjectState => {
  if (!persisted || typeof persisted !== 'object') return { ...DEFAULT_PROJECT, sceneSettings: defaultSettings() };
  const candidate = persisted as Partial<StoredProjectState>;
  const incoming = candidate.sceneSettings && typeof candidate.sceneSettings === 'object' ? candidate.sceneSettings : {};
  const sceneSettings = defaultSettings();
  for (const sceneId of sceneIds) {
    const settings = (incoming as Partial<Record<SceneId, Partial<SceneSettings>>>)[sceneId];
    if (!settings || typeof settings !== 'object') continue;
    for (const key of Object.keys(DEFAULT_SCENE_SETTINGS) as Array<keyof SceneSettings>) {
      const value = settings[key];
      if (typeof value === 'number' && Number.isFinite(value)) sceneSettings[sceneId][key] = Math.min(1, Math.max(0, value));
    }
  }
  return {
    projectName: typeof candidate.projectName === 'string' && candidate.projectName.trim() ? candidate.projectName : DEFAULT_PROJECT.projectName,
    activeSceneId: sceneIds.includes(candidate.activeSceneId as SceneId) ? (candidate.activeSceneId as SceneId) : DEFAULT_PROJECT.activeSceneId,
    sceneSettings,
    paletteId: paletteIds.includes(candidate.paletteId as PaletteId) ? (candidate.paletteId as PaletteId) : DEFAULT_PROJECT.paletteId,
    profileId: profileIds.includes(candidate.profileId as CanvasProfileId) ? (candidate.profileId as CanvasProfileId) : DEFAULT_PROJECT.profileId,
    seed: typeof candidate.seed === 'number' && Number.isFinite(candidate.seed) ? candidate.seed : DEFAULT_PROJECT.seed,
  };
};

interface ProjectStore extends StoredProjectState {
  setScene: (sceneId: SceneId) => void;
  setSceneSetting: (key: keyof SceneSettings, value: number) => void;
  resetScene: () => void;
  setPalette: (paletteId: PaletteId) => void;
  setProfile: (profileId: CanvasProfileId) => void;
  setProjectName: (projectName: string) => void;
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      ...DEFAULT_PROJECT,
      setScene: (activeSceneId) => set({ activeSceneId }),
      setSceneSetting: (key, value) =>
        set((state) => ({
          sceneSettings: {
            ...state.sceneSettings,
            [state.activeSceneId]: {
              ...state.sceneSettings[state.activeSceneId],
              [key]: Math.min(1, Math.max(0, value)),
            },
          },
        })),
      resetScene: () =>
        set((state) => ({
          sceneSettings: {
            ...state.sceneSettings,
            [state.activeSceneId]: { ...DEFAULT_SCENE_SETTINGS },
          },
        })),
      setPalette: (paletteId) => set({ paletteId }),
      setProfile: (profileId) => set({ profileId }),
      setProjectName: (projectName) => set({ projectName }),
    }),
    {
      name: 'audio-visualizer-project',
      version: 1,
      migrate: (persistedState) => migrateProject(persistedState),
      partialize: (state) => ({
        projectName: state.projectName,
        activeSceneId: state.activeSceneId,
        sceneSettings: state.sceneSettings,
        paletteId: state.paletteId,
        profileId: state.profileId,
        seed: state.seed,
      }),
    },
  ),
);
