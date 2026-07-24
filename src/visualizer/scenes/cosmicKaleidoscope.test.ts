import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { AudioFrame, Palette, SceneSettings } from '../../types';
import {
  cosmicKaleidoscope,
  getCosmicKaleidoscopeQualityProfile,
  mapCosmicKaleidoscopeUniforms,
} from './cosmicKaleidoscope';
import {
  COSMIC_KALEIDOSCOPE_FRAGMENT_SHADER,
  COSMIC_KALEIDOSCOPE_VERTEX_SHADER,
} from '../shaders/cosmicKaleidoscope';

const palette: Palette = {
  id: 'aurora', name: 'Aurora', description: 'test', background: '#07111f', surface: '#122642',
  primary: '#55d6ff', secondary: '#9b6cff', accent: '#ff73d2', muted: '#7890aa',
};

const settings: SceneSettings = { energy: 0.7, sensitivity: 0.65, motion: 0.5, density: 0.6, glow: 0.8, background: 0.4 };
const frame = (overrides: Partial<AudioFrame> = {}): AudioFrame => ({
  frequencyBins: [0, 32, 64, 128, 192, 255], waveform: [], bassEnergy: 0.25, midEnergy: 0.4,
  trebleEnergy: 0.55, volume: 0.3, beatPulse: 0.1, ...overrides,
});
const input = (overrides: Partial<Parameters<typeof mapCosmicKaleidoscopeUniforms>[0]> = {}) => ({
  width: 1280, height: 720, frame: frame(), settings, palette, elapsed: 1500, seed: 42, quality: 'high' as const, reducedMotion: false, ...overrides,
});

const makeGl = (): WebGL2RenderingContext => ({
  VERTEX_SHADER: 0x8b31,
  FRAGMENT_SHADER: 0x8b30,
  COMPILE_STATUS: 0x8b81,
  LINK_STATUS: 0x8b82,
  ARRAY_BUFFER: 0x8892,
  STATIC_DRAW: 0x88e4,
  FLOAT: 0x1406,
  TRIANGLES: 0x0004,
  createShader: vi.fn(() => ({})),
  shaderSource: vi.fn(),
  compileShader: vi.fn(),
  getShaderParameter: vi.fn(() => true),
  getShaderInfoLog: vi.fn(() => ''),
  deleteShader: vi.fn(),
  createProgram: vi.fn(() => ({})),
  attachShader: vi.fn(),
  linkProgram: vi.fn(),
  getProgramParameter: vi.fn(() => true),
  getProgramInfoLog: vi.fn(() => ''),
  deleteProgram: vi.fn(),
  createVertexArray: vi.fn(() => ({})),
  deleteVertexArray: vi.fn(),
  createBuffer: vi.fn(() => ({})),
  deleteBuffer: vi.fn(),
  bindVertexArray: vi.fn(),
  bindBuffer: vi.fn(),
  bufferData: vi.fn(),
  enableVertexAttribArray: vi.fn(),
  vertexAttribPointer: vi.fn(),
  getUniformLocation: vi.fn(() => ({})),
  uniform1f: vi.fn(),
  uniform2f: vi.fn(),
  uniform3f: vi.fn(),
  useProgram: vi.fn(),
  drawArrays: vi.fn(),
  viewport: vi.fn(),
} as unknown as WebGL2RenderingContext);

const boundedUniformValues = (uniforms: ReturnType<typeof mapCosmicKaleidoscopeUniforms>): number[] => [
  uniforms.bass, uniforms.coreScale, uniforms.zoom, uniforms.bassPulse, uniforms.mid, uniforms.structuralDeformation,
  uniforms.treble, uniforms.fineDetail, uniforms.beatPulse, uniforms.motion, uniforms.starTravel, uniforms.radialLight,
  uniforms.density, uniforms.glow,
  uniforms.background, uniforms.radialIterations, uniforms.detailIterations, uniforms.reducedMotion,
  ...uniforms.resolution, uniforms.time, uniforms.seed, ...uniforms.backgroundColor, ...uniforms.primaryColor,
  ...uniforms.secondaryColor, ...uniforms.accentColor,
];

describe('Cosmic Kaleidoscope uniform mapping', () => {
  it('keeps silence finite and bounded while retaining a readable core frame', () => {
    const uniforms = mapCosmicKaleidoscopeUniforms(input({ frame: frame({ frequencyBins: [], bassEnergy: 0, midEnergy: 0, trebleEnergy: 0, volume: 0, beatPulse: 0 }) }));
    expect(boundedUniformValues(uniforms).every((value) => Number.isFinite(value))).toBe(true);
    expect(uniforms.bass).toBe(0);
    expect(uniforms.coreScale).toBeGreaterThan(0);
    expect(uniforms.radialIterations).toBeGreaterThan(0);
  });

  it('clamps peak audio and hostile settings to their bounded uniform ranges', () => {
    const uniforms = mapCosmicKaleidoscopeUniforms(input({
      frame: frame({ frequencyBins: [255, 9999, Number.NaN], bassEnergy: 9, midEnergy: 4, trebleEnergy: 3, volume: 2, beatPulse: 5 }),
      settings: { energy: 4, sensitivity: 3, motion: 2, density: 9, glow: 8, background: 7 },
    }));
    expect(boundedUniformValues(uniforms).every((value) => value >= 0 && value <= 100000)).toBe(true);
    expect(uniforms.bass).toBe(1);
    expect(uniforms.mid).toBe(1);
    expect(uniforms.treble).toBe(1);
    expect(uniforms.beatPulse).toBe(1);
    expect(uniforms.density).toBe(1);
    expect(uniforms.glow).toBe(1);
  });

  it('maps bass, mids, treble bins, beats and settings to distinct controls', () => {
    const quiet = mapCosmicKaleidoscopeUniforms(input({ frame: frame({ bassEnergy: 0, midEnergy: 0, trebleEnergy: 0, frequencyBins: [], beatPulse: 0 }), settings: { ...settings, motion: 0, density: 0, glow: 0, background: 0 } }));
    const loud = mapCosmicKaleidoscopeUniforms(input({ frame: frame({ bassEnergy: 1, midEnergy: 1, trebleEnergy: 1, frequencyBins: [255, 255], beatPulse: 1 }), settings: { ...settings, motion: 1, density: 1, glow: 1, background: 1 } }));
    expect(loud.coreScale).toBeGreaterThan(quiet.coreScale);
    expect(loud.bassPulse).toBeGreaterThan(quiet.bassPulse);
    expect(loud.structuralDeformation).toBeGreaterThan(quiet.structuralDeformation);
    expect(loud.fineDetail).toBeGreaterThan(quiet.fineDetail);
    expect(loud.beatPulse).toBeGreaterThan(quiet.beatPulse);
    expect(loud.motion).toBeGreaterThan(quiet.motion);
    expect(loud.density).toBeGreaterThan(quiet.density);
    expect(loud.glow).toBeGreaterThan(quiet.glow);
    expect(loud.background).toBeGreaterThan(quiet.background);
    expect(loud.zoom).toBeGreaterThan(quiet.zoom);
    expect(loud.starTravel).toBeGreaterThan(quiet.starTravel);
    expect(loud.radialLight).toBeGreaterThan(quiet.radialLight);
  });

  it('doubles continuous motion while keeping reduced motion static', () => {
    const base = mapCosmicKaleidoscopeUniforms(input({ settings: { ...settings, motion: 0.35 } }));
    const reduced = mapCosmicKaleidoscopeUniforms(input({ settings: { ...settings, motion: 0.35 }, reducedMotion: true }));

    expect(base.motion).toBeCloseTo(0.7);
    expect(base.starTravel).toBeGreaterThan(0);
    expect(reduced.motion).toBe(0);
    expect(reduced.starTravel).toBe(0);
  });

  it('is deterministic for identical seed, dimensions, settings and audio', () => {
    expect(mapCosmicKaleidoscopeUniforms(input())).toEqual(mapCosmicKaleidoscopeUniforms(input()));
    expect(mapCosmicKaleidoscopeUniforms(input({ seed: 43 }))).not.toEqual(mapCosmicKaleidoscopeUniforms(input()));
  });

  it('uses distinct bounded quality budgets', () => {
    const high = getCosmicKaleidoscopeQualityProfile('high');
    const balanced = getCosmicKaleidoscopeQualityProfile('balanced');
    const low = getCosmicKaleidoscopeQualityProfile('low');
    expect(high.radialIterations).toBeGreaterThan(balanced.radialIterations);
    expect(balanced.radialIterations).toBeGreaterThan(low.radialIterations);
    expect(high.detailIterations).toBeGreaterThan(balanced.detailIterations);
    expect(balanced.detailIterations).toBeGreaterThan(low.detailIterations);
    for (const profile of [high, balanced, low]) {
      expect(profile.radialIterations).toBeGreaterThan(0);
      expect(profile.radialIterations).toBeLessThanOrEqual(12);
      expect(profile.detailIterations).toBeGreaterThan(0);
      expect(profile.detailIterations).toBeLessThanOrEqual(8);
    }
  });

  it('freezes continuous time and rotation while preserving static detail in reduced motion', () => {
    const reduced = mapCosmicKaleidoscopeUniforms(input({ reducedMotion: true }));
    expect(reduced.time).toBe(0);
    expect(reduced.motion).toBe(0);
    expect(reduced.reducedMotion).toBe(1);
    expect(reduced.radialIterations).toBeGreaterThan(0);
    expect(reduced.coreScale).toBeGreaterThan(0);
  });
});

describe('Cosmic Kaleidoscope shader/module contract', () => {
  it('declares a WebGL2 module with the typed backend and shared settings contract', () => {
    expect(cosmicKaleidoscope.manifest.backend).toBe('webgl2');
    expect(cosmicKaleidoscope.manifest.id).toBe('cosmic-kaleidoscope');
    expect(cosmicKaleidoscope.manifest.capabilities).toEqual(['audio-frame', 'canvas', 'settings']);
    expect(cosmicKaleidoscope.defaults.density).toBeGreaterThan(0);
  });

  it('uses a normalized fullscreen triangle and GLSL ES 3.00 sources', () => {
    expect(COSMIC_KALEIDOSCOPE_VERTEX_SHADER).toContain('#version 300 es');
    expect(COSMIC_KALEIDOSCOPE_VERTEX_SHADER).toContain('aPosition * 0.5 + 0.5');
    const moduleSource = readFileSync(resolve(process.cwd(), 'src/visualizer/scenes/cosmicKaleidoscope.ts'), 'utf8');
    expect(moduleSource).toContain('[-1, -1, 3, -1, -1, 3]');
    expect(COSMIC_KALEIDOSCOPE_FRAGMENT_SHADER).toContain('MAX_RADIAL_ITERATIONS = 12');
    expect(COSMIC_KALEIDOSCOPE_FRAGMENT_SHADER).toContain('MAX_DETAIL_ITERATIONS = 8');
    expect(COSMIC_KALEIDOSCOPE_FRAGMENT_SHADER).not.toMatch(/\b(?:texture|sampler2D|samplerCube|fetch|while)\b/);
    expect(COSMIC_KALEIDOSCOPE_FRAGMENT_SHADER).not.toMatch(/\bwhile\s*\(/);
    expect(COSMIC_KALEIDOSCOPE_FRAGMENT_SHADER.match(/for\s*\(/g)).toHaveLength(2);
    expect(COSMIC_KALEIDOSCOPE_FRAGMENT_SHADER).toContain('layer < MAX_RADIAL_ITERATIONS');
    expect(COSMIC_KALEIDOSCOPE_FRAGMENT_SHADER).toContain('detail < MAX_DETAIL_ITERATIONS');
  });

  it('allocates the fullscreen primitive once, uploads uniforms, draws and cleans up', () => {
    const gl = makeGl();
    const lifecycle = cosmicKaleidoscope.create({ backend: 'webgl2', canvas: {} as HTMLCanvasElement, gl });
    lifecycle.resize({ width: 640, height: 360, devicePixelRatio: 2 });
    lifecycle.update({
      backend: 'webgl2', gl, ...input(),
    });

    expect(gl.createVertexArray).toHaveBeenCalledOnce();
    expect(gl.createBuffer).toHaveBeenCalledOnce();
    expect(gl.bufferData).toHaveBeenCalledWith(gl.ARRAY_BUFFER, expect.any(Float32Array), gl.STATIC_DRAW);
    expect(gl.viewport).toHaveBeenCalledWith(0, 0, 1280, 720);
    expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 0, 3);
    expect(gl.uniform1f).toHaveBeenCalled();

    lifecycle.destroy();
    lifecycle.destroy();
    expect(gl.deleteVertexArray).toHaveBeenCalledOnce();
    expect(gl.deleteBuffer).toHaveBeenCalledOnce();
    expect(gl.deleteProgram).toHaveBeenCalledOnce();
  });

  it('keeps shader sources in the repository and avoids network/texture dependencies', () => {
    const moduleSource = readFileSync(resolve(process.cwd(), 'src/visualizer/scenes/cosmicKaleidoscope.ts'), 'utf8');
    const shaderSource = readFileSync(resolve(process.cwd(), 'src/visualizer/shaders/cosmicKaleidoscope.ts'), 'utf8');
    expect(moduleSource).toContain('compileWebGLProgram');
    expect(shaderSource).toContain('#version 300 es');
    expect(moduleSource).not.toMatch(/\b(?:fetch|WebSocket|ImageBitmap|HTMLImageElement)\b/);
    expect(shaderSource).not.toMatch(/\b(?:texture|sampler2D|samplerCube)\b/);
  });
});
