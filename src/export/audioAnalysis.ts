import { clamp, toReadonlyNumericArray } from '../core/audioMath';
import type { AudioFrame } from '../types';

export interface DecodedAudioBufferLike {
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  readonly length: number;
  readonly duration: number;
  getChannelData(channel: number): Float32Array;
}

export interface OfflineAudioAnalysis {
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  readonly duration: number;
  frameAt(timestamp: number, duration?: number): AudioFrame;
  samplesAt(timestamp: number, duration: number): readonly Float32Array[];
  pcmSnapshot(): readonly Float32Array[];
}

const WAVEFORM_LENGTH = 256;
const SPECTRUM_BINS = 128;

const createBoundaryFrame = (): AudioFrame => ({
  waveform: toReadonlyNumericArray(new Float32Array(WAVEFORM_LENGTH)),
  frequencyBins: toReadonlyNumericArray(new Float32Array(SPECTRUM_BINS)),
  bassEnergy: 0,
  midEnergy: 0,
  trebleEnergy: 0,
  volume: 0,
  beatPulse: 0,
});
const DFT_BINS = 32;
const ANALYSIS_WINDOW = 512;

const assertBuffer = (buffer: DecodedAudioBufferLike): void => {
  if (!buffer || !Number.isFinite(buffer.sampleRate) || buffer.sampleRate <= 0
    || !Number.isInteger(buffer.numberOfChannels) || buffer.numberOfChannels <= 0
    || !Number.isInteger(buffer.length) || buffer.length <= 0
    || !Number.isFinite(buffer.duration) || buffer.duration <= 0
    || typeof buffer.getChannelData !== 'function') {
    throw new Error('Decoded audio buffer is invalid.');
  }
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    if (!(data instanceof Float32Array) || data.length < buffer.length) throw new Error('Decoded audio buffer channel data is invalid.');
  }
};

const sampleAt = (buffer: DecodedAudioBufferLike, channel: number, index: number): number => {
  if (index < 0 || index >= buffer.length) return 0;
  return buffer.getChannelData(channel)[index] ?? 0;
};

const monoAt = (buffer: DecodedAudioBufferLike, index: number): number => {
  let value = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) value += sampleAt(buffer, channel, index);
  return value / buffer.numberOfChannels;
};

const normalizedTimestamp = (timestamp: number, duration: number): number => {
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, Math.min(Math.max(0, duration), timestamp));
};

const createFrequencyBins = (buffer: DecodedAudioBufferLike, start: number): Uint8Array => {
  const bins = new Uint8Array(SPECTRUM_BINS);
  const magnitudes = new Float64Array(DFT_BINS);
  const windowSize = Math.min(ANALYSIS_WINDOW, buffer.length);
  for (let bin = 0; bin < DFT_BINS; bin += 1) {
    let real = 0;
    let imaginary = 0;
    for (let offset = 0; offset < windowSize; offset += 1) {
      const sample = monoAt(buffer, start + offset);
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * offset) / Math.max(1, windowSize - 1));
      const angle = (2 * Math.PI * bin * offset) / windowSize;
      real += sample * window * Math.cos(angle);
      imaginary -= sample * window * Math.sin(angle);
    }
    magnitudes[bin] = Math.sqrt(real * real + imaginary * imaginary) / Math.max(1, windowSize);
  }
  let peak = 0;
  for (let index = 0; index < magnitudes.length; index += 1) peak = Math.max(peak, magnitudes[index] ?? 0);
  for (let index = 0; index < bins.length; index += 1) {
    const source = Math.min(DFT_BINS - 1, Math.floor((index / bins.length) * DFT_BINS));
    bins[index] = Math.round(clamp((magnitudes[source] ?? 0) / Math.max(0.0001, peak)) * 255);
  }
  return bins;
};

const createFrame = (buffer: DecodedAudioBufferLike, timestamp: number, frameDuration: number): AudioFrame => {
  const safeTimestamp = normalizedTimestamp(timestamp, buffer.duration);
  const start = Math.min(buffer.length - 1, Math.floor(safeTimestamp * buffer.sampleRate));
  const waveform = new Uint8Array(WAVEFORM_LENGTH);
  let squareSum = 0;
  let absoluteSum = 0;
  for (let index = 0; index < waveform.length; index += 1) {
    const source = start + Math.floor((index / waveform.length) * Math.max(1, Math.floor(frameDuration * buffer.sampleRate)));
    const sample = monoAt(buffer, source);
    const normalized = clamp(sample * 0.5 + 0.5);
    waveform[index] = Math.round(normalized * 255);
    squareSum += sample * sample;
    absoluteSum += Math.abs(sample);
  }
  const sampleCount = waveform.length;
  const volume = clamp(Math.sqrt(squareSum / sampleCount) * 1.8);
  const bins = createFrequencyBins(buffer, start);
  const band = (from: number, to: number): number => {
    let sum = 0;
    let count = 0;
    for (let index = from; index < to; index += 1) {
      sum += (bins[index] ?? 0) / 255;
      count += 1;
    }
    return count ? clamp(sum / count) : 0;
  };
  return {
    frequencyBins: toReadonlyNumericArray(bins),
    waveform: toReadonlyNumericArray(waveform),
    bassEnergy: band(0, 16),
    midEnergy: band(16, 64),
    trebleEnergy: band(64, 128),
    volume: clamp(Math.max(volume, (absoluteSum / sampleCount) * 1.4)),
    beatPulse: 0,
  };
};

export const createOfflineAudioAnalysis = (buffer: DecodedAudioBufferLike): OfflineAudioAnalysis => {
  assertBuffer(buffer);
  return {
    sampleRate: buffer.sampleRate,
    numberOfChannels: buffer.numberOfChannels,
    duration: buffer.duration,
    frameAt: (timestamp, duration = 1 / 30) => timestamp < 0 || timestamp >= buffer.duration
      ? createBoundaryFrame()
      : createFrame(buffer, timestamp, Math.max(1 / buffer.sampleRate, duration)),
    samplesAt: (timestamp, duration) => {
      if (!Number.isFinite(duration) || duration <= 0) throw new Error('Audio sample duration must be positive.');
      const start = Math.min(buffer.length, Math.max(0, Math.floor(normalizedTimestamp(timestamp, buffer.duration) * buffer.sampleRate)));
      const frameCount = Math.max(1, Math.ceil(duration * buffer.sampleRate));
      return Array.from({ length: buffer.numberOfChannels }, (_, channel) => {
        const samples = new Float32Array(frameCount);
        const source = buffer.getChannelData(channel);
        const available = Math.max(0, Math.min(frameCount, source.length - start));
        if (available > 0) samples.set(source.subarray(start, start + available));
        return samples;
      });
    },
    pcmSnapshot: () => Array.from({ length: buffer.numberOfChannels }, (_, channel) => new Float32Array(buffer.getChannelData(channel))),
  };
};

export const decodeAudioFile = async (input: Blob | ArrayBuffer): Promise<OfflineAudioAnalysis> => {
  const AudioContextConstructor = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) throw new Error('Web Audio API decode is not available in this browser.');
  const context = new AudioContextConstructor();
  try {
    const data = input instanceof ArrayBuffer ? input.slice(0) : await input.arrayBuffer();
    const decoded = await context.decodeAudioData(data.slice(0));
    return createOfflineAudioAnalysis(decoded);
  } finally {
    await context.close().catch(() => undefined);
  }
};

export const createSilentOfflineAudioAnalysis = (duration: number, sampleRate = 48_000, numberOfChannels = 2): OfflineAudioAnalysis => {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Silent analysis duration must be positive.');
  const length = Math.ceil(duration * sampleRate);
  const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  return createOfflineAudioAnalysis({
    sampleRate,
    numberOfChannels,
    length,
    duration,
    getChannelData: (channel) => channels[channel] ?? channels[0],
  });
};


