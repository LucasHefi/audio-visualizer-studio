import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_CANVAS_PROFILE_ID, normalizeCanvasProfileId } from './catalog';
import { migrateSettings, sanitizeSettings, settingsSchemaToDefaults, SCENE_SETTINGS_SCHEMA } from './settingsSchema';
import { SCENE_MODULES } from '../visualizer/sceneModules';
import type { CanvasProfileId, LegacyCanvasProfileId, PaletteId, SceneId, SceneSettings, StoredProjectState, VisualLayer } from '../types';

export const DEFAULT_SCENE_SETTINGS: SceneSettings = settingsSchemaToDefaults(SCENE_SETTINGS_SCHEMA) as unknown as SceneSettings;
export const SCENE_IDS: SceneId[] = ['spectrum', 'waveform', 'orbital', 'fluid-glow', 'cosmic-kaleidoscope', 'layered-circles'];
export const PALETTE_IDS: PaletteId[] = ['aurora', 'ember', 'mono', 'ocean', 'ruby', 'emerald', 'ice-cold'];
export const MAX_ACTIVE_LAYERS = 3;
export const DEFAULT_LAYER_ID = 'layer-1';

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const sceneDefaults = (sceneId: SceneId): SceneSettings => ({
  ...DEFAULT_SCENE_SETTINGS,
  ...(SCENE_MODULES[sceneId]?.defaults ?? {}),
});
const defaultSettings = (): Record<SceneId, SceneSettings> =>
  Object.fromEntries(SCENE_IDS.map((id) => [id, sceneDefaults(id)])) as Record<SceneId, SceneSettings>;
const defaultLayer = (): VisualLayer => ({ id: DEFAULT_LAYER_ID, sceneId: 'spectrum', settings: sceneDefaults('spectrum'), paletteId: 'aurora', seed: 1407, enabled: true });

const DEFAULT_PROJECT: StoredProjectState = {
  projectName: 'Untitled visual study',
  activeSceneId: 'spectrum',
  sceneSettings: defaultSettings(),
  paletteId: 'aurora',
  profileId: DEFAULT_CANVAS_PROFILE_ID,
  seed: 1407,
  visualLayers: [defaultLayer()],
  selectedLayerId: DEFAULT_LAYER_ID,
};

const normalizeLayer = (value: unknown, fallbackIndex: number, fallbackSettings: Record<SceneId, SceneSettings>): VisualLayer | null => {
  if (!isRecord(value)) return null;
  const sceneId = SCENE_IDS.includes(value.sceneId as SceneId) ? value.sceneId as SceneId : 'spectrum';
  const paletteId = PALETTE_IDS.includes(value.paletteId as PaletteId) ? value.paletteId as PaletteId : 'aurora';
  const id = typeof value.id === 'string' && value.id.trim() ? value.id : `layer-${fallbackIndex + 1}`;
  const settings = sanitizeSettings(SCENE_SETTINGS_SCHEMA, value.settings ?? fallbackSettings[sceneId] ?? sceneDefaults(sceneId));
  const seed = typeof value.seed === 'number' && Number.isFinite(value.seed) ? value.seed : 1407 + fallbackIndex;
  return { id, sceneId, settings, paletteId, seed, enabled: value.enabled !== false };
};

export const migrateProject = (persisted: unknown, version = 1): StoredProjectState => {
  if (!persisted || !isRecord(persisted)) return { ...DEFAULT_PROJECT, sceneSettings: defaultSettings(), visualLayers: [defaultLayer()] };
  const candidate = persisted as Partial<StoredProjectState> & Record<string, unknown>;
  const incoming: Record<string, unknown> = isRecord(candidate.sceneSettings) ? candidate.sceneSettings : {};
  const sceneSettings = defaultSettings();
  for (const sceneId of SCENE_IDS) {
    const settings = incoming[sceneId];
    if (!settings || typeof settings !== 'object') continue;
    const migrated = migrateSettings(SCENE_SETTINGS_SCHEMA, settings, version);
    sceneSettings[sceneId] = sanitizeSettings(SCENE_SETTINGS_SCHEMA, migrated);
  }

  const legacySceneId = SCENE_IDS.includes(candidate.activeSceneId as SceneId) ? candidate.activeSceneId as SceneId : 'spectrum';
  const legacyPaletteId = PALETTE_IDS.includes(candidate.paletteId as PaletteId) ? candidate.paletteId as PaletteId : 'aurora';
  const legacySeed = typeof candidate.seed === 'number' && Number.isFinite(candidate.seed) ? candidate.seed : DEFAULT_PROJECT.seed;
  const incomingLayers = Array.isArray(candidate.visualLayers) ? candidate.visualLayers : [];
  const normalizedLayers = incomingLayers
    .map((layer, index) => normalizeLayer(layer, index, sceneSettings))
    .filter((layer): layer is VisualLayer => Boolean(layer))
    .filter((layer, index, all) => all.findIndex((candidateLayer) => candidateLayer.id === layer.id) === index);
  let enabledCount = 0;
  const layers = normalizedLayers.map((layer) => {
    if (!layer.enabled || enabledCount >= MAX_ACTIVE_LAYERS) return { ...layer, enabled: false };
    enabledCount += 1;
    return layer;
  });
  if (layers.length === 0) {
    layers.push({
      id: DEFAULT_LAYER_ID,
      sceneId: legacySceneId,
      settings: sanitizeSettings(SCENE_SETTINGS_SCHEMA, sceneSettings[legacySceneId] ?? candidate.sceneSettings),
      paletteId: legacyPaletteId,
      seed: legacySeed,
      enabled: true,
    });
  }
  const selectedLayerId = typeof candidate.selectedLayerId === 'string' && layers.some((layer) => layer.id === candidate.selectedLayerId)
    ? candidate.selectedLayerId
    : layers[0].id;
  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId) ?? layers[0];
  sceneSettings[selectedLayer.sceneId] = { ...selectedLayer.settings };

  return {
    projectName: typeof candidate.projectName === 'string' && candidate.projectName.trim() ? candidate.projectName : DEFAULT_PROJECT.projectName,
    activeSceneId: selectedLayer.sceneId,
    sceneSettings,
    paletteId: selectedLayer.paletteId,
    profileId: normalizeCanvasProfileId(candidate.profileId),
    seed: selectedLayer.seed,
    visualLayers: layers,
    selectedLayerId: selectedLayer.id,
  };
};

/** Persisted state is normalized on every rehydrate so incomplete catalog/layer writes never reach a renderer. */
export const normalizeProjectState = (persisted: unknown): StoredProjectState => migrateProject(persisted, SCENE_SETTINGS_SCHEMA.version);

const randomUnit = (seed: number, index: number): number => {
  const safeSeed = seed >>> 0;
  const value = Math.sin(safeSeed * 12.9898 + index * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

const nextRandomSeed = (seed: number): number => {
  const safeSeed = seed >>> 0;
  return (Math.imul(safeSeed, 1664525) + 1013904223) >>> 0 || 1;
};

export const randomizeSettings = (settings: SceneSettings, seed: number): SceneSettings => {
  const next = { ...settings } as Record<keyof SceneSettings, number>;
  (Object.keys(SCENE_SETTINGS_SCHEMA.fields) as Array<keyof SceneSettings>).forEach((key, index) => {
    const definition = SCENE_SETTINGS_SCHEMA.fields[key];
    const raw = definition.min + randomUnit(seed, index) * (definition.max - definition.min);
    next[key] = Math.round(raw / definition.step) * definition.step;
  });
  return sanitizeSettings(SCENE_SETTINGS_SCHEMA, next);
};

interface ProjectStore extends StoredProjectState {
  setScene: (sceneId: SceneId) => void;
  selectScene: (sceneId: SceneId) => void;
  toggleScene: (sceneId: SceneId) => void;
  selectLayer: (layerId: string) => void;
  setLayerEnabled: (layerId: string, enabled: boolean) => void;
  setSceneSetting: (key: keyof SceneSettings, value: number) => void;
  resetScene: () => void;
  randomizeScene: () => void;
  setPalette: (paletteId: PaletteId) => void;
  setLayerPalette: (layerId: string, paletteId: PaletteId) => void;
  setProfile: (profileId: CanvasProfileId | LegacyCanvasProfileId) => void;
  setProjectName: (projectName: string) => void;
}

const selectedLayer = (state: ProjectStore): VisualLayer => state.visualLayers.find((layer) => layer.id === state.selectedLayerId) ?? state.visualLayers[0];
const withSelectedMirror = (state: ProjectStore, layer: VisualLayer) => ({
  activeSceneId: layer.sceneId,
  sceneSettings: { ...state.sceneSettings, [layer.sceneId]: { ...layer.settings } },
  paletteId: layer.paletteId,
  seed: layer.seed,
});

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      ...DEFAULT_PROJECT,
      setScene: (sceneId) => set((state) => {
        const current = selectedLayer(state);
        const settings = state.sceneSettings[sceneId] ?? sceneDefaults(sceneId);
        const nextLayer = { ...current, sceneId, settings: { ...settings } };
        const visualLayers = state.visualLayers.map((layer) => layer.id === current.id ? nextLayer : layer);
        return { visualLayers, ...withSelectedMirror(state, nextLayer) };
      }),
      selectScene: (sceneId) => set((state) => {
        const existing = state.visualLayers.find((layer) => layer.sceneId === sceneId);
        if (existing) return { selectedLayerId: existing.id, ...withSelectedMirror(state, existing) };
        const nextLayer: VisualLayer = { id: `layer-${sceneId}`, sceneId, settings: sceneDefaults(sceneId), paletteId: state.paletteId, seed: state.seed + state.visualLayers.length, enabled: false };
        return { visualLayers: [...state.visualLayers, nextLayer], selectedLayerId: nextLayer.id, ...withSelectedMirror(state, nextLayer) };
      }),
      toggleScene: (sceneId) => set((state) => {
        const existing = state.visualLayers.find((layer) => layer.sceneId === sceneId);
        if (existing) {
          if (!existing.enabled && state.visualLayers.filter((layer) => layer.enabled).length >= MAX_ACTIVE_LAYERS) return state;
          return { visualLayers: state.visualLayers.map((layer) => layer.id === existing.id ? { ...layer, enabled: !layer.enabled } : layer) };
        }
        if (state.visualLayers.filter((layer) => layer.enabled).length >= MAX_ACTIVE_LAYERS) return state;
        const nextLayer: VisualLayer = { id: `layer-${sceneId}`, sceneId, settings: sceneDefaults(sceneId), paletteId: state.paletteId, seed: state.seed + state.visualLayers.length, enabled: true };
        return { visualLayers: [...state.visualLayers, nextLayer] };
      }),
      selectLayer: (layerId) => set((state) => {
        const layer = state.visualLayers.find((candidate) => candidate.id === layerId);
        return layer ? { selectedLayerId: layer.id, ...withSelectedMirror(state, layer) } : state;
      }),
      setLayerEnabled: (layerId, enabled) => set((state) => {
        const layer = state.visualLayers.find((candidate) => candidate.id === layerId);
        if (!layer || (enabled && !layer.enabled && state.visualLayers.filter((candidate) => candidate.enabled).length >= MAX_ACTIVE_LAYERS)) return state;
        return { visualLayers: state.visualLayers.map((candidate) => candidate.id === layerId ? { ...candidate, enabled } : candidate) };
      }),
      setSceneSetting: (key, value) => set((state) => {
        const current = selectedLayer(state);
        const nextLayer = { ...current, settings: { ...current.settings, [key]: Math.min(1, Math.max(0, value)) } };
        return { visualLayers: state.visualLayers.map((layer) => layer.id === current.id ? nextLayer : layer), ...withSelectedMirror(state, nextLayer) };
      }),
      resetScene: () => set((state) => {
        const current = selectedLayer(state);
        const nextLayer = { ...current, settings: sceneDefaults(current.sceneId) };
        return { visualLayers: state.visualLayers.map((layer) => layer.id === current.id ? nextLayer : layer), ...withSelectedMirror(state, nextLayer) };
      }),
      randomizeScene: () => set((state) => {
        const current = selectedLayer(state);
        const nextSeed = nextRandomSeed(current.seed);
        const nextLayer = { ...current, seed: nextSeed, settings: randomizeSettings(current.settings, nextSeed) };
        return { visualLayers: state.visualLayers.map((layer) => layer.id === current.id ? nextLayer : layer), ...withSelectedMirror(state, nextLayer) };
      }),
      setPalette: (paletteId) => set((state) => {
        const current = selectedLayer(state);
        if (!current || !PALETTE_IDS.includes(paletteId)) return state;
        const nextLayer = { ...current, paletteId };
        return { visualLayers: state.visualLayers.map((layer) => layer.id === current.id ? nextLayer : layer), ...withSelectedMirror(state, nextLayer) };
      }),
      setLayerPalette: (layerId, paletteId) => set((state) => {
        if (!PALETTE_IDS.includes(paletteId)) return state;
        const layer = state.visualLayers.find((candidate) => candidate.id === layerId);
        if (!layer) return state;
        const nextLayer = { ...layer, paletteId };
        const visualLayers = state.visualLayers.map((candidate) => candidate.id === layerId ? nextLayer : candidate);
        return layerId === state.selectedLayerId ? { visualLayers, ...withSelectedMirror(state, nextLayer) } : { visualLayers };
      }),
      setProfile: (profileId) => set({ profileId: normalizeCanvasProfileId(profileId) }),
      setProjectName: (projectName) => set({ projectName }),
    }),
    {
      name: 'audio-visualizer-project',
      version: 5,
      migrate: (persistedState, version) => migrateProject(persistedState, version),
      merge: (persistedState, currentState) => ({ ...currentState, ...normalizeProjectState(persistedState) }),
      partialize: (state) => ({
        projectName: state.projectName,
        activeSceneId: state.activeSceneId,
        sceneSettings: state.sceneSettings,
        paletteId: state.paletteId,
        profileId: state.profileId,
        seed: state.seed,
        visualLayers: state.visualLayers,
        selectedLayerId: state.selectedLayerId,
      }),
    },
  ),
);
