import { describe, expect, it, vi } from 'vitest';
import { createSilentFrame } from '../core/audioMath';
import { PALETTES } from '../core/catalog';
import type { ModuleUpdateInput } from '../types';
import {
  OrbitalParticleCache,
  createOrbitalLifecycle,
  getOrbitalParticleCount,
  renderOrbitalFrame,
} from './sceneModules';

const makeContext = () => ({
  fillStyle: '',
  shadowBlur: 0,
  shadowColor: '',
  globalCompositeOperation: 'source-over',
  globalAlpha: 1,
  lineWidth: 1,
  createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  fillRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  arc: vi.fn(),
  ellipse: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
}) as unknown as CanvasRenderingContext2D;

const settings = {
  energy: 0.7,
  sensitivity: 0.62,
  motion: 0.62,
  density: 0.7,
  glow: 0.78,
  background: 0.28,
};

const updateInput = (ctx: CanvasRenderingContext2D, quality: ModuleUpdateInput['quality']): ModuleUpdateInput => ({
  ctx,
  width: 1280,
  height: 720,
  frame: createSilentFrame(),
  settings,
  palette: PALETTES.aurora,
  elapsed: 1000,
  seed: 42,
  quality,
  reducedMotion: false,
});

describe('Orbital renderer performance contract', () => {
  it('bounds particle work and scales it down for balanced and low quality', () => {
    const high = getOrbitalParticleCount(1, 'high');
    expect(high).toBeLessThanOrEqual(144);
    expect(getOrbitalParticleCount(0.7, 'balanced')).toBeLessThan(high);
    expect(getOrbitalParticleCount(0.7, 'low')).toBeLessThan(getOrbitalParticleCount(0.7, 'balanced'));
  });

  it('reuses deterministic particle descriptors until the seed or count changes', () => {
    const cache = new OrbitalParticleCache();
    const first = cache.get(42, 64);
    expect(cache.get(42, 64)).toBe(first);
    expect(cache.get(42, 65)).not.toBe(first);
    cache.clear();
    expect(cache.get(42, 65)).not.toBe(first);
  });

  it('batches particle fills by color instead of filling once per particle', () => {
    const context = makeContext();
    const cache = new OrbitalParticleCache();
    renderOrbitalFrame(context, 1280, 720, createSilentFrame(), settings, PALETTES.aurora, 1000, cache.get(42, 30), 'high', false);

    expect(context.arc).toHaveBeenCalledTimes(30);
    expect(context.fill).toHaveBeenCalledTimes(3);
    expect(context.ellipse).toHaveBeenCalledTimes(4);
    expect(context.shadowBlur).toBe(0);
    expect(context.globalCompositeOperation).toBe('source-over');
  });

  it('uses the lifecycle quality setting to reduce particle work and clears on destroy', () => {
    const context = makeContext();
    const lifecycle = createOrbitalLifecycle();
    lifecycle.update(updateInput(context, 'high'));
    const highArcCalls = (context.arc as ReturnType<typeof vi.fn>).mock.calls.length;
    vi.clearAllMocks();

    lifecycle.setQuality('low');
    lifecycle.update(updateInput(context, 'low'));
    const lowArcCalls = (context.arc as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(lowArcCalls).toBeLessThan(highArcCalls);

    lifecycle.destroy();
    expect(() => lifecycle.update(updateInput(context, 'low'))).toThrow('updated after destroy');
  });
});
