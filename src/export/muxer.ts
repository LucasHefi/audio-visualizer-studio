import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { EXPORT_AUDIO_CODEC, EXPORT_VIDEO_CODEC } from './capability';

export interface Mp4MuxerHandle {
  addVideoChunk(chunk: EncodedVideoChunk, metadata: EncodedVideoChunkMetadata | undefined): void;
  addAudioChunk(chunk: EncodedAudioChunk, metadata: EncodedAudioChunkMetadata | undefined): void;
  finalize(): Blob;
}

export const createMp4Muxer = (input: {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly sampleRate: number;
  readonly numberOfChannels: number;
}): Mp4MuxerHandle => {
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    // AAC encoders may emit a variable number of chunks because of codec
    // delay and device-specific buffering. The object form requires an exact
    // upper bound and throws when a mobile encoder emits one extra chunk.
    fastStart: 'in-memory',
    firstTimestampBehavior: 'strict',
    video: { codec: 'avc', width: input.width, height: input.height, frameRate: input.fps },
    audio: { codec: 'aac', sampleRate: input.sampleRate, numberOfChannels: input.numberOfChannels },
  });
  let finalized = false;
  return {
    addVideoChunk: (chunk, metadata) => {
      if (finalized) throw new Error('MP4 muxer has already been finalized.');
      muxer.addVideoChunk(chunk, metadata);
    },
    addAudioChunk: (chunk, metadata) => {
      if (finalized) throw new Error('MP4 muxer has already been finalized.');
      muxer.addAudioChunk(chunk, metadata);
    },
    finalize: () => {
      if (!finalized) {
        muxer.finalize();
        finalized = true;
      }
      const buffer = target.buffer;
      if (!(buffer instanceof ArrayBuffer) || buffer.byteLength === 0) throw new Error(`MP4 muxer returned an empty artifact for ${EXPORT_VIDEO_CODEC}/${EXPORT_AUDIO_CODEC}.`);
      return new Blob([buffer], { type: 'video/mp4' });
    },
  };
};
