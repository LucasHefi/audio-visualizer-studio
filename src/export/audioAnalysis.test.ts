import { describe, expect, it } from 'vitest';
import { createOfflineAudioAnalysis } from './audioAnalysis';

const createBuffer = (duration = 1, sampleRate = 8_000) => {
  const length = Math.floor(duration * sampleRate);
  const left = Float32Array.from({ length }, (_, index) => Math.sin(index / 8) * 0.5);
  const right = Float32Array.from({ length }, (_, index) => Math.cos(index / 11) * 0.25);
  return {
    sampleRate,
    numberOfChannels: 2,
    length,
    duration,
    getChannelData: (channel: number) => channel === 0 ? left : right,
  };
};

describe('offline audio analysis', () => {
  it('creates deterministic audio-reactive frames from decoded samples', () => {
    const buffer = createBuffer();
    const first = createOfflineAudioAnalysis(buffer);
    const second = createOfflineAudioAnalysis(buffer);

    expect(first.frameAt(0)).toEqual(second.frameAt(0));
    expect(first.frameAt(0).waveform.length).toBe(256);
    expect(first.frameAt(0).frequencyBins.length).toBe(128);
    expect(first.frameAt(0).volume).toBeGreaterThan(0);
    expect(first.frameAt(0).bassEnergy).toBeGreaterThanOrEqual(0);
    expect(first.frameAt(0).bassEnergy).toBeLessThanOrEqual(1);
  });

  it('clamps frame reads at the decoded audio duration and pads encoder samples', () => {
    const analysis = createOfflineAudioAnalysis(createBuffer(0.25));
    const samples = analysis.samplesAt(0.2, 0.2);

    expect(samples).toHaveLength(2);
    expect(samples[0]).toHaveLength(1_600);
    expect(samples[0].some((value) => value !== 0)).toBe(true);
    expect(samples[0][samples[0].length - 1]).toBe(0);
    expect(analysis.frameAt(99).volume).toBe(0);
  });

  it('rejects malformed decoded audio buffers instead of inventing silence', () => {
    expect(() => createOfflineAudioAnalysis({} as never)).toThrow('Decoded audio buffer is invalid.');
  });
});
