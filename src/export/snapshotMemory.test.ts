import { describe, expect, it } from 'vitest';
import { iterateTimestampedTimeline } from './snapshot';
import type { OfflineAudioAnalysis } from './audioAnalysis';
import type { ExportFramePlan } from './types';

const audio = {
  frameAt: (timestamp: number) => ({
    waveform: new Uint8Array([Math.round(timestamp * 10)]),
    frequencyBins: new Uint8Array([0]),
    bassEnergy: 0,
    midEnergy: 0,
    trebleEnergy: 0,
    volume: timestamp,
    beatPulse: 0,
  }),
} as unknown as OfflineAudioAnalysis;

describe('iterateTimestampedTimeline', () => {
  it('yields frames lazily instead of allocating a timeline array', () => {
    const plan = {
      fps: 2,
      duration: 1,
      totalFrames: 2,
      frames: [
        { index: 0, timestamp: 0, duration: 0.5 },
        { index: 1, timestamp: 0.5, duration: 0.5 },
      ],
    } as ExportFramePlan;

    const timeline = iterateTimestampedTimeline(plan, audio);

    expect(Array.isArray(timeline)).toBe(false);
    expect([...timeline].map((frame) => frame.index)).toEqual([0, 1]);
  });
});
