import type { AudioFrame, CanvasProfileId, ModuleQuality, Palette, SceneId, SceneSettings } from '../types';

export type ExportJobState = 'idle' | 'validating' | 'rendering' | 'encoding' | 'completed' | 'cancelled' | 'failed';

export type ExportValidationCode =
  | 'INVALID_REQUEST'
  | 'INVALID_PROFILE'
  | 'INVALID_DIMENSIONS'
  | 'PROFILE_DIMENSIONS_MISMATCH'
  | 'INVALID_FPS'
  | 'INVALID_DURATION'
  | 'INVALID_SEED'
  | 'INVALID_AUDIO_IDENTITY'
  | 'TOO_MANY_FRAMES'
  | 'AUDIO_REQUIRED'
  | 'NO_ACTIVE_LAYERS'
  | 'UNSUPPORTED_CAPABILITY'
  | 'RENDERER_UNAVAILABLE'
  | 'ENCODER_FAILED'
  | 'MUXER_FAILED'
  | 'CANCELLED';

export class ExportValidationError extends Error {
  public readonly code: ExportValidationCode;

  public constructor(code: ExportValidationCode, message: string) {
    super(message);
    this.name = 'ExportValidationError';
    this.code = code;
  }
}

export interface ExportAudioIdentity {
  readonly name: string;
  readonly size: number;
  readonly lastModified: number;
}

export interface ExportRequest {
  readonly profileId: CanvasProfileId;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly duration: number;
  readonly seed: number;
  readonly audio: ExportAudioIdentity;
}

export interface ExportFrame {
  readonly index: number;
  readonly timestamp: number;
  readonly duration: number;
}

export interface ExportFramePlan {
  readonly fps: number;
  readonly duration: number;
  readonly totalFrames: number;
  readonly frames: readonly ExportFrame[];
}

export interface ExportLayerRenderState {
  readonly id: string;
  readonly sceneId: SceneId;
  readonly settings: SceneSettings;
  readonly palette: Palette;
  readonly seed: number;
}

export interface ExportRenderState {
  readonly layers: readonly ExportLayerRenderState[];
  readonly quality: ModuleQuality;
  readonly reducedMotion: boolean;
}

export interface ExportTimelineFrame extends ExportFrame {
  readonly audioFrame: AudioFrame;
}
