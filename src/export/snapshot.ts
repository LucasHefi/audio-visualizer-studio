import { calculateBeatPulse } from '../core/audioMath';
import type { CanvasProfile, Palette, SceneId, SceneModule, SceneSettings } from '../types';
import type { OfflineAudioAnalysis } from './audioAnalysis';
import { buildExportFramePlan } from './framePlan';
import type { ExportFramePlan, ExportLayerRenderState, ExportRenderState, ExportRequest, ExportTimelineFrame } from './types';

export interface FrozenExportLayer extends ExportLayerRenderState {
  readonly module: SceneModule;
}

export interface FrozenExportSnapshot {
  readonly request: ExportRequest;
  readonly plan: ExportFramePlan;
  readonly render: Readonly<{
    readonly layers: readonly FrozenExportLayer[];
    readonly quality: 'high' | 'balanced' | 'low';
    readonly reducedMotion: boolean;
  }>;
  readonly profile: CanvasProfile;
}

export interface ExportSnapshotLayerInput {
  readonly id: string;
  readonly module: SceneModule;
  readonly palette: Palette;
  readonly settings: SceneSettings;
  readonly seed: number;
}

export const createFrozenExportSnapshot = (input: {
  readonly request: ExportRequest;
  readonly profile: CanvasProfile;
  readonly layers: readonly ExportSnapshotLayerInput[];
  readonly reducedMotion: boolean;
  readonly quality?: 'high' | 'balanced' | 'low';
}): FrozenExportSnapshot => {
  const plan = buildExportFramePlan(input.request);
  const layers = Object.freeze(input.layers.map((layer) => Object.freeze({
    id: layer.id,
    sceneId: layer.module.manifest.id as SceneId,
    settings: Object.freeze({ ...layer.settings }),
    palette: Object.freeze({ ...layer.palette }),
    seed: layer.seed,
    module: layer.module,
  })));
  const render: FrozenExportSnapshot['render'] = Object.freeze({
    layers,
    quality: input.quality ?? 'high',
    reducedMotion: input.reducedMotion,
  });
  return Object.freeze({
    request: Object.freeze({ ...input.request, audio: Object.freeze({ ...input.request.audio }) }),
    plan,
    render,
    profile: input.profile,
  });
};

export const toStructuredCloneableExportRender = (render: FrozenExportSnapshot['render']): ExportRenderState => ({
  layers: render.layers.map(({ module: _module, ...layer }) => ({
    id: layer.id,
    sceneId: layer.sceneId,
    settings: { ...layer.settings },
    palette: { ...layer.palette },
    seed: layer.seed,
  })),
  quality: render.quality,
  reducedMotion: render.reducedMotion,
});

export function* iterateTimestampedTimeline(
  plan: ExportFramePlan,
  audio: OfflineAudioAnalysis,
): Generator<ExportTimelineFrame, void, undefined> {
  let previousVolume = 0;
  for (const frame of plan.frames) {
    const audioFrame = audio.frameAt(frame.timestamp, frame.duration);
    const withBeat = Object.freeze({ ...audioFrame, beatPulse: calculateBeatPulse(audioFrame.volume, previousVolume) });
    previousVolume = audioFrame.volume;
    yield Object.freeze({ ...frame, audioFrame: withBeat });
  }
}

export const buildTimestampedTimeline = (
  plan: ExportFramePlan,
  audio: OfflineAudioAnalysis,
): readonly ExportTimelineFrame[] => Object.freeze([...iterateTimestampedTimeline(plan, audio)]);
