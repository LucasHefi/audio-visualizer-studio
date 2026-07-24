import { describe, expect, it } from 'vitest';
import { PALETTES } from '../core/catalog';
import type { AudioFrame, Canvas2DRenderingContext, SceneSettings } from '../types';
import { createLayeredCircleStackGeometry, renderLayeredCirclesFrame } from './sceneModules';

const settings: SceneSettings = { energy: 0.68, sensitivity: 0.64, motion: 0.34, density: 0.54, glow: 0.66, background: 0.48 };
const frame = (overrides: Partial<AudioFrame> = {}): AudioFrame => ({
  frequencyBins: new Uint8Array([10, 40, 80, 120, 200]),
  waveform: new Uint8Array([100, 128, 180]),
  bassEnergy: 0.6,
  midEnergy: 0.45,
  trebleEnergy: 0.7,
  volume: 0.5,
  beatPulse: 0.25,
  ...overrides,
});

const context = () => {
  const calls: string[] = [];
  const fillStyles: string[] = [];
  let currentFillStyle = '';
  const target = {
    calls,
    fillStyles,
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    fillRect: () => calls.push('fillRect'),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    beginPath: () => calls.push('beginPath'),
    ellipse: () => calls.push('ellipse'),
    fill: () => calls.push('fill'),
    stroke: () => calls.push('stroke'),
    lineWidth: 1,
    strokeStyle: '',
    globalCompositeOperation: 'source-over',
  } as Record<string, unknown>;
  Object.defineProperty(target, 'fillStyle', { get: () => currentFillStyle, set: (value: string) => { currentFillStyle = value; fillStyles.push(value); } });
  return target as unknown as Canvas2DRenderingContext & { calls: string[]; fillStyles: string[] };
};

describe('Layered Circles renderer', () => {
  it('renders audio-sized circle stacks from a shared bottom baseline', () => {
    const quietGeometry = createLayeredCircleStackGeometry(1280, 720, frame({ beatPulse: 0 }), settings, 1000, 42);
    const loudGeometry = createLayeredCircleStackGeometry(1280, 720, frame({ beatPulse: 1, bassEnergy: 1 }), settings, 1000, 42);
    expect(new Set(quietGeometry.map((point) => point.column)).size).toBeGreaterThan(4);
    expect(quietGeometry.every((point, index, all) => index === 0 || point.column >= all[index - 1].column)).toBe(true);
    expect(loudGeometry.length).toBeGreaterThan(quietGeometry.length);
    expect(new Set(quietGeometry.map((point) => point.y)).size).toBeGreaterThan(1);

    const quiet = context();
    const loud = context();
    renderLayeredCirclesFrame(quiet, 1280, 720, frame({ beatPulse: 0 }), settings, PALETTES.emerald, 1000, 42);
    renderLayeredCirclesFrame(loud, 1280, 720, frame({ beatPulse: 1, bassEnergy: 1 }), settings, PALETTES.emerald, 1000, 42);

    expect(quiet.calls.filter((call) => call === 'ellipse').length).toBe(quietGeometry.length);
    expect(loud.calls.filter((call) => call === 'ellipse').length).toBe(loudGeometry.length);
    expect(loud.calls.filter((call) => call === 'ellipse').length).toBeGreaterThan(quiet.calls.filter((call) => call === 'ellipse').length);
    expect(quiet.fillStyles).not.toEqual(loud.fillStyles);
  });

  it('keeps the module deterministic for reduced motion and cleans canvas state', () => {
    const first = context();
    const second = context();
    renderLayeredCirclesFrame(first, 900, 900, frame(), settings, PALETTES['ice-cold'], 2000, 7, true);
    renderLayeredCirclesFrame(second, 900, 900, frame(), settings, PALETTES['ice-cold'], 2000, 7, true);
    expect(first.calls).toEqual(second.calls);
    expect(first.calls).toContain('save');
    expect(first.calls[first.calls.length - 1]).toBe('restore');
  });
});
