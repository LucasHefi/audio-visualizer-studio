import { afterEach, describe, expect, it, vi } from 'vitest';
import { CANVAS_PROFILES, PALETTES } from '../core/catalog';
import { SCENE_REGISTRY } from '../visualizer/sceneModules';
import type { SceneSettings } from '../types';
import { createFrozenExportSnapshot } from './snapshot';
import { runWebCodecsMp4Export } from './pipeline';
import type { ExportRequest } from './types';

const mockState = vi.hoisted(() => ({
  rendererOptions: null as any,
  renderCalls: [] as any[],
}));

vi.mock('./capability', () => ({
  probeExportCapabilities: vi.fn(async () => ({
    supported: true,
    container: 'mp4',
    videoCodec: 'avc1.42001f',
    audioCodec: 'mp4a.40.2',
    reasons: [],
  })),
}));

vi.mock('./muxer', () => ({
  createMp4Muxer: vi.fn(() => ({
    addVideoChunk: vi.fn(),
    addAudioChunk: vi.fn(),
    finalize: vi.fn(() => new Blob(['fake-mp4'], { type: 'video/mp4' })),
  })),
}));

vi.mock('./renderer', () => ({
  createExportCanvas: vi.fn(() => ({})),
  DeterministicExportRenderer: class {
    public constructor(options: unknown) {
      mockState.rendererOptions = options;
    }

    public render(frame: unknown) {
      mockState.renderCalls.push(frame);
      return { videoFrame: {}, close: vi.fn() };
    }

    public destroy = vi.fn();
  },
}));

class FakeEncoder {
  public static readonly isConfigSupported = vi.fn(async () => ({ supported: true }));
  public encodeQueueSize = 0;
  public readonly configure = vi.fn();
  public readonly encode = vi.fn();
  public readonly flush = vi.fn(async () => undefined);
  public readonly close = vi.fn();

  public constructor(_callbacks: unknown) {}
}

class FakeAudioData {
  public readonly close = vi.fn();

  public constructor(_init: unknown) {}
}

afterEach(() => {
  vi.unstubAllGlobals();
  mockState.rendererOptions = null;
  mockState.renderCalls.length = 0;
});

const settings = (energy: number): SceneSettings => ({ energy, sensitivity: 0.5, motion: 0.5, density: 0.5, glow: 0.5, background: 0.5 });
const request: ExportRequest = { profileId: 'youtube-landscape', width: 1920, height: 1080, fps: 10, duration: 0.1, seed: 1, audio: { name: 'demo.mp3', size: 1, lastModified: 1 } };
const audio = {
  sampleRate: 10,
  numberOfChannels: 1,
  duration: 0.1,
  frameAt: vi.fn(() => ({ frequencyBins: [], waveform: [], bassEnergy: 0, midEnergy: 0, trebleEnergy: 0, volume: 0, beatPulse: 0 })),
  samplesAt: vi.fn(() => [new Float32Array(1)]),
  pcmSnapshot: vi.fn(() => [new Float32Array(1)]),
};

describe('multi-layer export pipeline', () => {
  it('passes the complete ordered layer graph to the deterministic renderer', async () => {
    vi.stubGlobal('VideoEncoder', FakeEncoder);
    vi.stubGlobal('AudioEncoder', FakeEncoder);
    vi.stubGlobal('AudioData', FakeAudioData);

    const spectrum = SCENE_REGISTRY.require('spectrum');
    const waveform = SCENE_REGISTRY.require('waveform');
    const snapshot = createFrozenExportSnapshot({
      request,
      profile: CANVAS_PROFILES['youtube-landscape'],
      layers: [
        { id: 'first', module: spectrum, palette: PALETTES.emerald, settings: settings(0.15), seed: 11 },
        { id: 'second', module: waveform, palette: PALETTES.ruby, settings: settings(0.85), seed: 22 },
      ],
      reducedMotion: true,
      quality: 'balanced',
    });

    const result = await runWebCodecsMp4Export({ snapshot, audio });

    expect(result.type).toBe('video/mp4');
    expect(mockState.rendererOptions.layers.map((layer: any) => ({
      id: layer.id,
      sceneId: layer.module.manifest.id,
      paletteId: layer.palette.id,
      energy: layer.settings.energy,
      seed: layer.seed,
    }))).toEqual([
      { id: 'first', sceneId: 'spectrum', paletteId: 'emerald', energy: 0.15, seed: 11 },
      { id: 'second', sceneId: 'waveform', paletteId: 'ruby', energy: 0.85, seed: 22 },
    ]);
    expect(mockState.renderCalls).toHaveLength(snapshot.plan.totalFrames);
    expect(audio.frameAt).toHaveBeenCalledTimes(snapshot.plan.totalFrames);
  });
});
