import { probeExportCapabilities } from './capability';
import { waitForEncoderCapacity } from './encoderBackpressure';
import { createMp4Muxer } from './muxer';
import { createExportCanvas, DeterministicExportRenderer } from './renderer';
import { iterateTimestampedTimeline, type FrozenExportSnapshot } from './snapshot';
import { ExportValidationError, type ExportJobState } from './types';
import type { OfflineAudioAnalysis } from './audioAnalysis';

export interface ExportProgress {
  readonly state: ExportJobState;
  readonly completed: number;
  readonly total: number;
  readonly message: string;
}

export interface ExportRunInput {
  readonly snapshot: FrozenExportSnapshot;
  readonly audio: OfflineAudioAnalysis;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ExportProgress) => void;
}

const throwIfCancelled = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw new ExportValidationError('CANCELLED', 'Export was cancelled.');
};

const emit = (onProgress: ExportRunInput['onProgress'], state: ExportJobState, completed: number, total: number, message: string): void => {
  onProgress?.({ state, completed, total, message });
};

const closeEncoder = (encoder: VideoEncoder | AudioEncoder | null): void => {
  if (!encoder) return;
  try { encoder.close(); } catch { /* already closed after an encode failure */ }
};

export const runWebCodecsMp4Export = async ({ snapshot, audio, signal, onProgress }: ExportRunInput): Promise<Blob> => {
  const { request, plan } = snapshot;
  throwIfCancelled(signal);
  if (snapshot.render.layers.length === 0) throw new ExportValidationError('NO_ACTIVE_LAYERS', 'At least one active visual layer is required for export.');
  emit(onProgress, 'validating', 0, plan.totalFrames, 'Validating WebCodecs and MP4 capabilities…');
  const capability = await probeExportCapabilities({
    width: request.width,
    height: request.height,
    fps: request.fps,
    sampleRate: audio.sampleRate,
    numberOfChannels: audio.numberOfChannels,
  });
  if (!capability.supported) throw new ExportValidationError('UNSUPPORTED_CAPABILITY', capability.reasons.join(' '));
  if (audio.duration <= 0) throw new ExportValidationError('AUDIO_REQUIRED', 'Decoded audio duration is empty.');

  const audioChunkFrames = 1_024;
  const muxer = createMp4Muxer({
    width: request.width,
    height: request.height,
    fps: request.fps,
    sampleRate: audio.sampleRate,
    numberOfChannels: audio.numberOfChannels,
  });
  let videoEncoder: VideoEncoder | null = null;
  let audioEncoder: AudioEncoder | null = null;
  let renderer: DeterministicExportRenderer | null = null;
  let encoderError: unknown = null;
  try {
    videoEncoder = new VideoEncoder({
      output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
      error: (error) => { encoderError = error; },
    });
    audioEncoder = new AudioEncoder({
      output: (chunk, metadata) => muxer.addAudioChunk(chunk, metadata),
      error: (error) => { encoderError = error; },
    });
    videoEncoder.configure({
      codec: capability.videoCodec,
      width: request.width,
      height: request.height,
      framerate: request.fps,
      bitrate: Math.max(250_000, Math.round(request.width * request.height * request.fps * 0.12)),
      avc: { format: 'avc' },
    });
    audioEncoder.configure({
      codec: capability.audioCodec,
      sampleRate: audio.sampleRate,
      numberOfChannels: audio.numberOfChannels,
      bitrate: audio.numberOfChannels > 1 ? 192_000 : 128_000,
    });
    emit(onProgress, 'encoding', 0, plan.totalFrames, 'Encoding timestamped audio…');
    for (let timestamp = 0; timestamp < request.duration - 1e-9; timestamp += audioChunkFrames / audio.sampleRate) {
      throwIfCancelled(signal);
      await waitForEncoderCapacity(audioEncoder, signal);
      const duration = Math.min(audioChunkFrames / audio.sampleRate, request.duration - timestamp);
      const samples = audio.samplesAt(timestamp, duration);
      const frameCount = samples[0]?.length ?? 0;
      const planar = new Float32Array(frameCount * audio.numberOfChannels);
      for (let channel = 0; channel < audio.numberOfChannels; channel += 1) planar.set(samples[channel] ?? new Float32Array(frameCount), channel * frameCount);
      const audioData = new AudioData({ format: 'f32-planar', data: planar.buffer, numberOfChannels: audio.numberOfChannels, numberOfFrames: frameCount, sampleRate: audio.sampleRate, timestamp: Math.round(timestamp * 1_000_000) });
      try {
        audioEncoder.encode(audioData);
      } finally {
        audioData.close();
      }
    }
    await audioEncoder.flush();
    if (encoderError) throw encoderError;

    emit(onProgress, 'rendering', 0, plan.totalFrames, 'Rendering deterministic frames…');
    renderer = new DeterministicExportRenderer({
      canvas: createExportCanvas(request.width, request.height),
      layers: snapshot.render.layers,
      width: request.width,
      height: request.height,
      quality: snapshot.render.quality,
      reducedMotion: snapshot.render.reducedMotion,
    });
    for (const frame of iterateTimestampedTimeline(plan, audio)) {
      throwIfCancelled(signal);
      await waitForEncoderCapacity(videoEncoder, signal);
      const rendered = renderer.render(frame);
      try {
        videoEncoder.encode(rendered.videoFrame, { keyFrame: frame.index % Math.max(1, Math.round(request.fps * 2)) === 0 });
      } finally {
        rendered.close();
      }
      emit(onProgress, 'rendering', frame.index + 1, plan.totalFrames, `Rendered frame ${frame.index + 1}/${plan.totalFrames}.`);
    }
    await videoEncoder.flush();
    if (encoderError) throw encoderError;
    emit(onProgress, 'encoding', plan.totalFrames, plan.totalFrames, 'Finalizing MP4 container…');
    const blob = muxer.finalize();
    emit(onProgress, 'completed', plan.totalFrames, plan.totalFrames, 'Export completed.');
    return blob;
  } catch (error) {
    if (error instanceof ExportValidationError) throw error;
    throw new ExportValidationError('ENCODER_FAILED', error instanceof Error ? error.message : String(error));
  } finally {
    renderer?.destroy();
    closeEncoder(videoEncoder);
    closeEncoder(audioEncoder);
  }
};
