import type { OfflineAudioAnalysis } from './audioAnalysis';
import { toStructuredCloneableExportRender, type FrozenExportSnapshot } from './snapshot';
import type { ExportProgress } from './pipeline';

interface WorkerProgressMessage { readonly type: 'progress'; readonly progress: ExportProgress; }
interface WorkerCompleteMessage { readonly type: 'complete'; readonly buffer: ArrayBuffer; readonly typeName: string; }
interface WorkerErrorMessage { readonly type: 'error'; readonly message: string; }
type WorkerResponse = WorkerProgressMessage | WorkerCompleteMessage | WorkerErrorMessage;

export const runWebCodecsMp4ExportInWorker = ({
  snapshot,
  audio,
  signal,
  onProgress,
}: {
  snapshot: FrozenExportSnapshot;
  audio: OfflineAudioAnalysis;
  signal?: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
}): Promise<Blob> => new Promise((resolve, reject) => {
  if (typeof Worker === 'undefined') {
    reject(new Error('Dedicated Worker export is not available in this browser.'));
    return;
  }
  const worker = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });
  const channels = audio.pcmSnapshot().map((channel) => channel.buffer);
  const cleanUp = () => {
    signal?.removeEventListener('abort', cancel);
    worker.terminate();
  };
  const cancel = () => worker.postMessage({ type: 'cancel' });
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    if (message.type === 'progress') {
      onProgress?.(message.progress);
      return;
    }
    cleanUp();
    if (message.type === 'complete') resolve(new Blob([message.buffer], { type: message.typeName || 'video/mp4' }));
    else reject(new Error(message.message));
  };
  worker.onerror = (event) => {
    cleanUp();
    reject(new Error(event.message || 'Export worker failed.'));
  };
  signal?.addEventListener('abort', cancel, { once: true });
  worker.postMessage({
    type: 'start',
    request: snapshot.request,
    render: toStructuredCloneableExportRender(snapshot.render),
    profile: snapshot.profile,
    audio: {
      sampleRate: audio.sampleRate,
      numberOfChannels: audio.numberOfChannels,
      duration: audio.duration,
      channels,
    },
  }, channels);
});
