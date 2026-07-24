export const EXPORT_VIDEO_CODEC = 'avc1.42001f' as const;
export const EXPORT_VIDEO_CODEC_CANDIDATES = [
  'avc1.42001f',
  'avc1.420028',
  'avc1.420029',
  'avc1.42002a',
  'avc1.420033',
] as const;
export const EXPORT_AUDIO_CODEC = 'mp4a.40.2' as const;

export type ExportVideoCodec = typeof EXPORT_VIDEO_CODEC_CANDIDATES[number];

export interface ExportCapabilityInput {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly sampleRate: number;
  readonly numberOfChannels: number;
}

export interface ExportCapabilityResult {
  readonly supported: boolean;
  readonly container: 'mp4';
  readonly videoCodec: ExportVideoCodec;
  readonly audioCodec: typeof EXPORT_AUDIO_CODEC;
  readonly reasons: readonly string[];
}

type EncoderConstructor = {
  isConfigSupported(config: unknown): Promise<{ supported?: boolean }>;
};

export interface WebCodecsGlobals {
  readonly VideoEncoder?: EncoderConstructor;
  readonly AudioEncoder?: EncoderConstructor;
  readonly VideoFrame?: unknown;
  readonly AudioData?: unknown;
}

export const createEncoderConfigs = (input: ExportCapabilityInput, videoCodec: ExportVideoCodec = EXPORT_VIDEO_CODEC) => ({
  video: {
    codec: videoCodec,
    width: input.width,
    height: input.height,
    framerate: input.fps,
    bitrate: Math.max(250_000, Math.round(input.width * input.height * input.fps * 0.12)),
    avc: { format: 'avc' },
  },
  audio: {
    codec: EXPORT_AUDIO_CODEC,
    sampleRate: input.sampleRate,
    numberOfChannels: input.numberOfChannels,
    bitrate: input.numberOfChannels > 1 ? 192_000 : 128_000,
  },
} as const);

export const probeExportCapabilities = async (
  input: ExportCapabilityInput,
  globals: WebCodecsGlobals = globalThis as unknown as WebCodecsGlobals,
): Promise<ExportCapabilityResult> => {
  const reasons: string[] = [];
  if (!globals.VideoEncoder) reasons.push('VideoEncoder is unavailable.');
  if (!globals.AudioEncoder) reasons.push('AudioEncoder is unavailable.');
  if (!globals.VideoFrame) reasons.push('VideoFrame is unavailable.');
  if (!globals.AudioData) reasons.push('AudioData is unavailable.');
  if (reasons.length === 0) {
    try {
      const audioConfig = createEncoderConfigs(input).audio;
      const videoSupport = await Promise.all(EXPORT_VIDEO_CODEC_CANDIDATES.map(async (codec) => ({
        codec,
        result: await globals.VideoEncoder!.isConfigSupported(createEncoderConfigs(input, codec).video),
      })));
      const selectedVideo = videoSupport.find(({ result }) => result.supported === true)?.codec;
      if (!selectedVideo) reasons.push('H.264 AVC video configuration is unsupported for the requested dimensions/FPS.');
      const audio = await globals.AudioEncoder!.isConfigSupported(audioConfig);
      if (audio.supported !== true) reasons.push('AAC audio configuration is unsupported.');
      if (selectedVideo) {
        return {
          supported: reasons.length === 0,
          container: 'mp4',
          videoCodec: selectedVideo,
          audioCodec: EXPORT_AUDIO_CODEC,
          reasons,
        };
      }
    } catch (error) {
      reasons.push(`WebCodecs capability probe failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return {
    supported: reasons.length === 0,
    container: 'mp4',
    videoCodec: EXPORT_VIDEO_CODEC,
    audioCodec: EXPORT_AUDIO_CODEC,
    reasons,
  };
};
