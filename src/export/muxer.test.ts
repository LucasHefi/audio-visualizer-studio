import { describe, expect, it, vi } from 'vitest';

let muxerOptions: Record<string, unknown> | undefined;

vi.mock('mp4-muxer', () => ({
  ArrayBufferTarget: class {
    buffer = new ArrayBuffer(1);
  },
  Muxer: class {
    constructor(options: Record<string, unknown>) {
      muxerOptions = options;
    }

    addVideoChunk(): void {}
    addAudioChunk(): void {}
    finalize(): void {}
  },
}));

import { createMp4Muxer } from './muxer';

describe('createMp4Muxer', () => {
  it('uses unbounded in-memory fast start for variable AAC chunk counts', () => {
    createMp4Muxer({
      width: 1920,
      height: 1080,
      fps: 30,
      sampleRate: 48_000,
      numberOfChannels: 2,
    });

    expect(muxerOptions?.fastStart).toBe('in-memory');
  });
});
