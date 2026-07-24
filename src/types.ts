export const MODULE_API_VERSION = 1 as const;

export type SceneId = 'spectrum' | '3d-spectrum' | 'waveform' | 'orbital' | 'fluid-glow' | 'cosmic-kaleidoscope' | 'layered-circles';
export type PaletteId = 'aurora' | 'ember' | 'mono' | 'ocean' | 'ruby' | 'emerald' | 'ice-cold';
export type CanvasProfileId =
  | 'youtube-landscape'
  | 'youtube-portrait'
  | 'tiktok-portrait'
  | 'tiktok-landscape'
  | 'instagram-portrait'
  | 'instagram-square'
  | 'instagram-landscape'
  | 'custom-18-9';
export type LegacyCanvasProfileId = 'wide' | 'vertical' | 'feed' | '18-9';
export type CanvasPlatform = 'YouTube' | 'TikTok' | 'Instagram' | 'Custom';
export type CanvasOrientation = 'landscape' | 'portrait' | 'square';
export type ModuleCapability = 'audio-frame' | 'canvas' | 'settings';
export type EntitlementTier = 'core' | 'free' | 'paid';
export type ModuleQuality = 'high' | 'balanced' | 'low';
export type RendererBackend = 'canvas2d' | 'webgl2';
export type ModuleBackend = RendererBackend;

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
  platform: CanvasPlatform;
  orientation: CanvasOrientation;
  orientationLabel: string;
  ratioLabel: string;
  ratio: number;
  width: number;
  height: number;
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
  backend: RendererBackend;
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
  ctx: Canvas2DRenderingContext;
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

export interface Canvas2DModuleUpdateInput extends ModuleUpdateInput {
  backend: 'canvas2d';
}

export interface WebGL2ModuleUpdateInput {
  backend: 'webgl2';
  gl: WebGL2RenderingContext;
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

export type RendererCanvas = HTMLCanvasElement | OffscreenCanvas;
export type Canvas2DRenderingContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface Canvas2DModuleCreateContext {
  backend: 'canvas2d';
  canvas: RendererCanvas;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}

export interface WebGL2ModuleCreateContext {
  backend: 'webgl2';
  canvas: RendererCanvas;
  gl: WebGL2RenderingContext;
}

export type RendererModuleCreateContext = Canvas2DModuleCreateContext | WebGL2ModuleCreateContext;

/** Legacy Canvas2D shape retained for existing callers; it cannot describe WebGL2. */
export interface ModuleCreateContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export interface ModuleLifecycle<Input extends ModuleUpdateInput | WebGL2ModuleUpdateInput = ModuleUpdateInput> {
  update: (input: Input) => void;
  resize: (input: ModuleResizeInput) => void;
  setQuality: (quality: ModuleQuality) => void;
  setReducedMotion: (enabled: boolean) => void;
  destroy: () => void;
}

export type Canvas2DSceneRender = (
  ctx: Canvas2DRenderingContext,
  width: number,
  height: number,
  frame: AudioFrame,
  settings: SceneSettings,
  palette: Palette,
  elapsed: number,
  seed: number,
) => void;

export interface Canvas2DSceneModule {
  manifest: SceneManifest & { backend: 'canvas2d' };
  defaults: SceneSettings;
  render: Canvas2DSceneRender;
  create?: (context: Canvas2DModuleCreateContext) => ModuleLifecycle;
}

export interface WebGL2SceneModule {
  manifest: SceneManifest & { backend: 'webgl2' };
  defaults: SceneSettings;
  create: (context: WebGL2ModuleCreateContext) => ModuleLifecycle<WebGL2ModuleUpdateInput>;
}

export type SceneModule = Canvas2DSceneModule | WebGL2SceneModule;

export interface AudioState {
  status: 'empty' | 'loading' | 'ready' | 'playing' | 'paused' | 'error';
  name: string;
  duration: number;
  currentTime: number;
  volume: number;
  error?: string;
}

export interface VisualLayer {
  id: string;
  sceneId: SceneId;
  settings: SceneSettings;
  paletteId: PaletteId;
  seed: number;
  enabled: boolean;
}

export interface StoredProjectState {
  projectName: string;
  activeSceneId: SceneId;
  sceneSettings: Record<SceneId, SceneSettings>;
  paletteId: PaletteId;
  profileId: CanvasProfileId;
  seed: number;
  visualLayers: VisualLayer[];
  selectedLayerId: string;
}
