import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_CANVAS_PROFILE_ID, normalizeCanvasProfileId } from './catalog';
import { migrateSettings, sanitizeSettings, settingsSchemaToDefaults, SCENE_SETTINGS_SCHEMA } from './settingsSchema';
import type { CanvasProfileId, LegacyCanvasProfileId, PaletteId, SceneId, SceneSettings, StoredProjectState } from '../types';

export const DEFAULT_SCENE_SETTINGS: SceneSettings = settingsSchemaToDefaults(SCENE_SETTINGS_SCHEMA) as unknown as SceneSettings;

const sceneIds: SceneId[] = ['spectrum', 'waveform', 'orbital', 'fluid-glow'];
const paletteIds: PaletteId[] = ['aurora', 'ember', 'mono', 'ocean'];
const defaultSettings = (): Record<SceneId, SceneSettings> =>
  Object.fromEntries(sceneIds.map((id) => [id, { ...DEFAULT_SCENE_SETTINGS }])) as Record<SceneId, SceneSettings>;

const DEFAULT_PROJECT: StoredProjectState = {
  projectName: 'Untitled visual study',
  activeSceneId: 'spectrum',
  sceneSettings: defaultSettings(),
  paletteId: 'aurora',
  profileId: DEFAULT_CANVAS_PROFILE_ID,
  seed: 1407,
};

export const migrateProject = (persisted: unknown, version = 1): StoredProjectState => {
  if (!persisted || typeof persisted !== 'object') return { ...DEFAULT_PROJECT, sceneSettings: defaultSettings() };
  const candidate = persisted as Partial<StoredProjectState>;
  const incoming = candidate.sceneSettings && typeof candidate.sceneSettings === 'object' ? candidate.sceneSettings : {};
  const sceneSettings = defaultSettings();
  for (const sceneId of sceneIds) {
    const settings = (incoming as Partial<Record<SceneId, Partial<SceneSettings>>>)[sceneId];
    if (!settings || typeof settings !== 'object') continue;
    const migrated = migrateSettings(SCENE_SETTINGS_SCHEMA, settings, version);
    sceneSettings[sceneId] = sanitizeSettings(SCENE_SETTINGS_SCHEMA, migrated);
  }
  return {
    projectName: typeof candidate.projectName === 'string' && candidate.projectName.trim() ? candidate.projectName : DEFAULT_PROJECT.projectName,
    activeSceneId: sceneIds.includes(candidate.activeSceneId as SceneId) ? (candidate.activeSceneId as SceneId) : DEFAULT_PROJECT.activeSceneId,
    sceneSettings,
    paletteId: paletteIds.includes(candidate.paletteId as PaletteId) ? (candidate.paletteId as PaletteId) : DEFAULT_PROJECT.paletteId,
    profileId: normalizeCanvasProfileId(candidate.profileId),
    seed: typeof candidate.seed === 'number' && Number.isFinite(candidate.seed) ? candidate.seed : DEFAULT_PROJECT.seed,
  };
};

interface ProjectStore extends StoredProjectState {
  setScene: (sceneId: SceneId) => void;
  setSceneSetting: (key: keyof SceneSettings, value: number) => void;
  resetScene: () => void;
  setPalette: (paletteId: PaletteId) => void;
  setProfile: (profileId: CanvasProfileId | LegacyCanvasProfileId) => void;
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
      setProfile: (profileId) => set({ profileId: normalizeCanvasProfileId(profileId) }),
      setProjectName: (projectName) => set({ projectName }),
    }),
    {
      name: 'audio-visualizer-project',
      version: 3,
      migrate: (persistedState, version) => migrateProject(persistedState, version),
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
