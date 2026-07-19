import { describe, expect, it } from 'vitest';
import { calculateBeatPulse, calculateEnergyBands, clamp, formatTime } from './audioMath';

describe('audio math contract', () => {
  it('normalises frequency bands to the 0..1 range', () => {
    const bins = new Uint8Array(100).fill(0);
    bins.fill(255, 0, 12);
    bins.fill(128, 12, 55);
    bins.fill(64, 55);
    const bands = calculateEnergyBands(bins);
    expect(bands.bassEnergy).toBe(1);
    expect(bands.midEnergy).toBeCloseTo(128 / 255, 2);
    expect(bands.trebleEnergy).toBeCloseTo(64 / 255, 2);
  });

  it('keeps pulse and values bounded', () => {
    expect(clamp(3)).toBe(1);
    expect(clamp(-1)).toBe(0);
    expect(calculateBeatPulse(1, 0)).toBe(1);
    expect(formatTime(74)).toBe('01:14');
  });
});
