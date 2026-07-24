import { createFrozenExportSnapshot, type FrozenExportSnapshot } from './snapshot';
import { runWebCodecsMp4Export, type ExportProgress } from './pipeline';
import { createOfflineAudioAnalysis } from './audioAnalysis';
import { SCENE_REGISTRY } from '../visualizer/sceneModules';
import type { ExportRenderState } from './types';

type WorkerStartMessage = {
  readonly type: 'start';
  readonly request: FrozenExportSnapshot['request'];
  readonly render: ExportRenderState;
  readonly profile: FrozenExportSnapshot['profile'];
  readonly audio: { readonly sampleRate: number; readonly numberOfChannels: number; readonly duration: number; readonly channels: readonly ArrayBuffer[] };
};
type WorkerCancelMessage = { readonly type: 'cancel' };
type WorkerMessage = WorkerStartMessage | WorkerCancelMessage;

type WorkerScope = {
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

const scope = globalThis as unknown as WorkerScope;
let controller: AbortController | null = null;

scope.onmessage = (event) => {
  const input = event.data;
  if (input.type !== 'start') {
    controller?.abort();
    return;
  }
  void (async () => {
    controller = new AbortController();
    try {
      const snapshot = createFrozenExportSnapshot({
        request: input.request,
        profile: input.profile,
        layers: input.render.layers.map((layer) => ({
          id: layer.id,
          module: SCENE_REGISTRY.require(layer.sceneId),
          palette: layer.palette,
          settings: layer.settings,
          seed: layer.seed,
        })),
        reducedMotion: input.render.reducedMotion,
        quality: input.render.quality,
      });
      const channels = input.audio.channels.map((data) => new Float32Array(data));
      const analysis = createOfflineAudioAnalysis({
        sampleRate: input.audio.sampleRate,
        numberOfChannels: input.audio.numberOfChannels,
        duration: input.audio.duration,
        length: channels[0]?.length ?? 0,
        getChannelData: (channel) => channels[channel] ?? channels[0]!,
      });
      const blob = await runWebCodecsMp4Export({
        snapshot,
        audio: analysis,
        signal: controller.signal,
        onProgress: (progress: ExportProgress) => scope.postMessage({ type: 'progress', progress }),
      });
      const buffer = await blob.arrayBuffer();
      scope.postMessage({ type: 'complete', buffer, typeName: blob.type }, [buffer]);
    } catch (error) {
      scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      controller = null;
    }
  })();
};
