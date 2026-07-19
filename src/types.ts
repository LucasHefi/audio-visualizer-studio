export type SceneId = 'spectrum' | 'waveform' | 'orbital' | 'fluid-glow';
export type PaletteId = 'aurora' | 'ember' | 'mono' | 'ocean';
export type CanvasProfileId = 'wide' | 'vertical' | 'feed' | '18-9';

export interface AudioFrame {
  frequencyBins: Uint8Array;
  waveform: Uint8Array;
  bassEnergy: number;
  midEnergy: number;
  trebleEnergy: number;
  volume: number;
  beatPulse: number;
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

export interface SceneManifest {
  id: SceneId;
  name: string;
  description: string;
  tags: string[];
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
