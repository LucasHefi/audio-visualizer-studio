import { describe, expect, it } from 'vitest';
import { probeExportCapabilities } from './capability';

const supportedGlobals = {
  VideoEncoder: { isConfigSupported: async () => ({ supported: true }) },
  AudioEncoder: { isConfigSupported: async () => ({ supported: true }) },
  VideoFrame: class {},
  AudioData: class {},
};

describe('WebCodecs export capability probe', () => {
  it('reports explicit support for the selected MP4 AVC/AAC path', async () => {
    const result = await probeExportCapabilities({ width: 1920, height: 1080, fps: 30, sampleRate: 48_000, numberOfChannels: 2 }, supportedGlobals);

    expect(result).toMatchObject({ supported: true, container: 'mp4', videoCodec: 'avc1.42001f', audioCodec: 'mp4a.40.2' });
    expect(result.reasons).toEqual([]);
  });

  it('fails closed when WebCodecs constructors are missing', async () => {
    const result = await probeExportCapabilities({ width: 1080, height: 1920, fps: 30, sampleRate: 48_000, numberOfChannels: 2 }, {});

    expect(result.supported).toBe(false);
    expect(result.reasons).toContain('VideoEncoder is unavailable.');
    expect(result.reasons).toContain('AudioEncoder is unavailable.');
    expect(result.reasons).toContain('VideoFrame is unavailable.');
    expect(result.reasons).toContain('AudioData is unavailable.');
  });

  it('does not report a supported path when either config is rejected', async () => {
    const result = await probeExportCapabilities({ width: 1080, height: 1080, fps: 30, sampleRate: 44_100, numberOfChannels: 1 }, {
      ...supportedGlobals,
      AudioEncoder: { isConfigSupported: async () => ({ supported: false }) },
    });

    expect(result.supported).toBe(false);
    expect(result.reasons).toContain('AAC audio configuration is unsupported.');
  });

  it('selects a higher H.264 level when the baseline level is rejected for the target size', async () => {
    const result = await probeExportCapabilities({ width: 1920, height: 1080, fps: 30, sampleRate: 48_000, numberOfChannels: 2 }, {
      ...supportedGlobals,
      VideoEncoder: {
        isConfigSupported: async (config: unknown) => ({
          supported: (config as { codec: string }).codec === 'avc1.420028',
        }),
      },
    });

    expect(result.supported).toBe(true);
    expect(result.videoCodec).toBe('avc1.420028');
  });
});
