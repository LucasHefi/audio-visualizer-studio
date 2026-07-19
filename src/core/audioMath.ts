import type { AudioFrame, ReadonlyNumericArray } from '../types';

export const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));

export const toReadonlyNumericArray = (values: ArrayLike<number>): ReadonlyNumericArray => Object.freeze(Array.from(values));

export const averageRange = (values: Uint8Array, start: number, end: number): number => {
  if (values.length === 0 || end <= start) return 0;
  let total = 0;
  const safeStart = Math.max(0, Math.min(values.length, Math.floor(start)));
  const safeEnd = Math.max(safeStart + 1, Math.min(values.length, Math.floor(end)));
  for (let index = safeStart; index < safeEnd; index += 1) total += values[index] ?? 0;
  return total / ((safeEnd - safeStart) * 255);
};

export const calculateEnergyBands = (frequencyBins: Uint8Array) => {
  const length = frequencyBins.length;
  return {
    bassEnergy: averageRange(frequencyBins, 0, length * 0.12),
    midEnergy: averageRange(frequencyBins, length * 0.12, length * 0.55),
    trebleEnergy: averageRange(frequencyBins, length * 0.55, length),
  };
};

export const calculateBeatPulse = (volume: number, previousVolume: number): number =>
  clamp(Math.max(0, volume - previousVolume) * 4 + volume * 0.12);

export const createSilentFrame = (size = 128): AudioFrame => ({
  frequencyBins: toReadonlyNumericArray(new Uint8Array(size)),
  waveform: toReadonlyNumericArray(new Uint8Array(size).fill(128)),
  bassEnergy: 0,
  midEnergy: 0,
  trebleEnergy: 0,
  volume: 0,
  beatPulse: 0,
});

export const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
};
