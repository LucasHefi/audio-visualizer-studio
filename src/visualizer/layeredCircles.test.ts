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
  it('renders audio-sized top-down stacks on a regular grid with an oblique rise', () => {
    const quietGeometry = createLayeredCircleStackGeometry(1280, 720, frame({ beatPulse: 0 }), settings, 1000, 42);
    const loudGeometry = createLayeredCircleStackGeometry(1280, 720, frame({ beatPulse: 1, bassEnergy: 1 }), settings, 1000, 42);
    const quietBase = quietGeometry.filter((point) => point.depth === 0);
    const origin = quietGeometry.find((point) => point.column === 0 && point.row === 0 && point.depth === 0);
    const lifted = quietGeometry.find((point) => point.column === 0 && point.row === 0 && point.depth === 1);

    expect(new Set(quietBase.map((point) => point.column)).size).toBeGreaterThan(4);
    expect(new Set(quietBase.map((point) => point.row)).size).toBeGreaterThan(2);
    expect(origin).toBeDefined();
    expect(lifted).toBeDefined();
    expect(lifted!.x).toBeGreaterThan(origin!.x);
    expect(lifted!.y).toBeLessThan(origin!.y);
    expect(quietGeometry.every((point) => point.radiusY > 0)).toBe(true);
    expect(quietGeometry.every((point) => point.radiusY < point.radius)).toBe(true);
    expect(loudGeometry.length).toBeGreaterThan(quietGeometry.length);

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
