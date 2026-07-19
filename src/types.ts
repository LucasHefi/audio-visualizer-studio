export const MODULE_API_VERSION = 1 as const;

export type SceneId = 'spectrum' | 'waveform' | 'orbital' | 'fluid-glow';
export type PaletteId = 'aurora' | 'ember' | 'mono' | 'ocean';
export type CanvasProfileId = 'wide' | 'vertical' | 'feed' | '18-9';
export type ModuleCapability = 'audio-frame' | 'canvas' | 'settings';
export type EntitlementTier = 'core' | 'free' | 'paid';
export type ModuleQuality = 'high' | 'balanced' | 'low';

export interface ReadonlyNumericArray {
  readonly length: number;
  readonly [index: number]: number;
}

export interface AudioFrame {
  readonly frequencyBins: ReadonlyNumericArray;
  readonly waveform: ReadonlyNumericArray;
  readonly bassEnergy: number;
  readonly midEnergy: number;
  readonly trebleEnergy: number;
  readonly volume: number;
  readonly beatPulse: number;
}

export interface SceneSettings {
  energy: number;
  sensitivity: number;
  motion: number;
  density: number;
  glow: number;
  background: number;
}

export interface Palette {
  id: PaletteId;
  name: string;
  description: string;
  background: string;
  surface: string;
  primary: string;
  secondary: string;
  accent: string;
  muted: string;
}

export interface CanvasProfile {
  id: CanvasProfileId;
  name: string;
  ratio: number;
  resolution: string;
}

export interface SettingDefinition {
  type: 'number';
  default: number;
  min: number;
  max: number;
  step: number;
}

export interface SettingsSchema {
  version: number;
  fields: Record<string, SettingDefinition>;
  migrate?: (value: unknown, fromVersion: number) => unknown;
}

export interface ModuleManifest {
  id: string;
  kind: 'visualizer';
  apiVersion: typeof MODULE_API_VERSION;
  version: string;
  name: string;
  description: string;
  tags: readonly string[];
  capabilities: readonly ModuleCapability[];
  entitlement: EntitlementTier;
  settingsSchema: SettingsSchema;
}

export interface SceneManifest extends ModuleManifest {
  id: SceneId;
}

export interface ModuleResizeInput {
  width: number;
  height: number;
  devicePixelRatio: number;
}

export interface ModuleUpdateInput {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  frame: AudioFrame;
  settings: SceneSettings;
  palette: Palette;
  elapsed: number;
  seed: number;
  quality: ModuleQuality;
  reducedMotion: boolean;
}

export interface ModuleCreateContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export interface ModuleLifecycle {
  update: (input: ModuleUpdateInput) => void;
  resize: (input: ModuleResizeInput) => void;
  setQuality: (quality: ModuleQuality) => void;
  setReducedMotion: (enabled: boolean) => void;
  destroy: () => void;
}

export interface SceneModule {
  manifest: SceneManifest;
  defaults: SceneSettings;
  render: (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    frame: AudioFrame,
    settings: SceneSettings,
    palette: Palette,
    elapsed: number,
    seed: number,
  ) => void;
  create?: (context: ModuleCreateContext) => ModuleLifecycle;
}

export interface AudioState {
  status: 'empty' | 'loading' | 'ready' | 'playing' | 'paused' | 'error';
  name: string;
  duration: number;
  currentTime: number;
  volume: number;
  error?: string;
}

export interface StoredProjectState {
  projectName: string;
  activeSceneId: SceneId;
  sceneSettings: Record<SceneId, SceneSettings>;
  paletteId: PaletteId;
  profileId: CanvasProfileId;
  seed: number;
}
