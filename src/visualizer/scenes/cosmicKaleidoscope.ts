import { SCENE_SETTINGS_SCHEMA } from '../../core/settingsSchema';
import { compileWebGLProgram, deleteWebGLProgram, WebGLRuntimeError } from '../WebGLRuntime';
import {
  COSMIC_KALEIDOSCOPE_FRAGMENT_SHADER,
  COSMIC_KALEIDOSCOPE_VERTEX_SHADER,
} from '../shaders/cosmicKaleidoscope';
import {
  MODULE_API_VERSION,
  type AudioFrame,
  type ModuleLifecycle,
  type ModuleQuality,
  type Palette,
  type SceneManifest,
  type SceneSettings,
  type WebGL2ModuleUpdateInput,
  type WebGL2SceneModule,
} from '../../types';

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

const finiteOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

const wrap = (value: number, period: number): number => {
  const normalized = finiteOr(value, 0) % period;
  return normalized < 0 ? normalized + period : normalized;
};

const normalizeFrequencyBin = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return clamp01(value > 1 ? value / 255 : value);
};

const frequencyEnergy = (bins: AudioFrame['frequencyBins']): number => {
  const sampleCount = Math.min(32, Math.max(0, Math.floor(bins.length)));
  if (!sampleCount) return 0;
  let sum = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const sourceIndex = sampleCount === 1
      ? 0
      : Math.floor((index / (sampleCount - 1)) * Math.max(0, bins.length - 1));
    sum += normalizeFrequencyBin(bins[sourceIndex] ?? 0);
  }
  return clamp01(sum / sampleCount);
};

const parseHexColor = (value: string): readonly [number, number, number] => {
  const clean = typeof value === 'string' ? value.replace('#', '') : '';
  const expanded = clean.length === 3 ? clean.split('').map((part) => `${part}${part}`).join('') : clean;
  const parsed = /^[0-9a-f]{6}$/i.test(expanded) ? Number.parseInt(expanded, 16) : 0;
  return [((parsed >> 16) & 255) / 255, ((parsed >> 8) & 255) / 255, (parsed & 255) / 255];
};

export const cosmicKaleidoscopeHexToRgb = parseHexColor;

export interface CosmicKaleidoscopeQualityProfile {
  readonly radialIterations: number;
  readonly detailIterations: number;
}

const QUALITY_PROFILES: Readonly<Record<ModuleQuality, CosmicKaleidoscopeQualityProfile>> = {
  high: { radialIterations: 12, detailIterations: 8 },
  balanced: { radialIterations: 8, detailIterations: 5 },
  low: { radialIterations: 5, detailIterations: 3 },
};

export const getCosmicKaleidoscopeQualityProfile = (quality: ModuleQuality): CosmicKaleidoscopeQualityProfile =>
  QUALITY_PROFILES[quality];

export interface CosmicKaleidoscopeMappingInput {
  readonly width: number;
  readonly height: number;
  readonly frame: AudioFrame;
  readonly settings: SceneSettings;
  readonly palette: Palette;
  readonly elapsed: number;
  readonly seed: number;
  readonly quality: ModuleQuality;
  readonly reducedMotion: boolean;
}

export interface CosmicKaleidoscopeUniforms {
  readonly resolution: readonly [number, number];
  readonly time: number;
  readonly seed: number;
  readonly bass: number;
  readonly coreScale: number;
  readonly zoom: number;
  readonly bassPulse: number;
  readonly mid: number;
  readonly structuralDeformation: number;
  readonly treble: number;
  readonly fineDetail: number;
  readonly beatPulse: number;
  readonly motion: number;
  readonly starTravel: number;
  readonly radialLight: number;
  readonly density: number;
  readonly glow: number;
  readonly background: number;
  readonly radialIterations: number;
  readonly detailIterations: number;
  readonly reducedMotion: number;
  readonly backgroundColor: readonly [number, number, number];
  readonly primaryColor: readonly [number, number, number];
  readonly secondaryColor: readonly [number, number, number];
  readonly accentColor: readonly [number, number, number];
}

export const mapCosmicKaleidoscopeUniforms = ({
  width,
  height,
  frame,
  settings,
  palette,
  elapsed,
  seed,
  quality,
  reducedMotion,
}: CosmicKaleidoscopeMappingInput): CosmicKaleidoscopeUniforms => {
  const safeSettings = {
    energy: clamp01(settings.energy),
    sensitivity: clamp01(settings.sensitivity),
    motion: clamp01(settings.motion),
    density: clamp01(settings.density),
    glow: clamp01(settings.glow),
    background: clamp01(settings.background),
  };
  const responseGain = 0.7 + safeSettings.sensitivity * 0.8;
  const bass = clamp01(clamp01(frame.bassEnergy) * responseGain);
  const mid = clamp01(clamp01(frame.midEnergy) * responseGain);
  const frequency = frequencyEnergy(frame.frequencyBins);
  const treble = clamp01((clamp01(frame.trebleEnergy) * 0.68 + frequency * 0.32) * responseGain);
  const beatPulse = clamp01(clamp01(frame.beatPulse) * (0.72 + safeSettings.energy * 0.55));
  const profile = getCosmicKaleidoscopeQualityProfile(quality);
  const radialIterations = Math.min(profile.radialIterations, Math.max(1, Math.round(profile.radialIterations * (0.68 + safeSettings.density * 0.32))));
  const detailIterations = Math.min(profile.detailIterations, Math.max(1, Math.round(profile.detailIterations * (0.65 + safeSettings.density * 0.35))));
  const effectiveMotion = reducedMotion ? 0 : safeSettings.motion * 2;
  const zoom = clamp01(0.36 + bass * 0.52 + clamp01(frame.volume) * 0.16 + beatPulse * 0.2);

  return {
    resolution: [Math.max(1, finiteOr(width, 1)), Math.max(1, finiteOr(height, 1))],
    time: reducedMotion ? 0 : wrap(finiteOr(elapsed, 0) * 0.001, 4096),
    seed: wrap(seed, 100000),
    bass,
    coreScale: clamp01(0.28 + bass * 0.8 + clamp01(frame.volume) * 0.24),
    zoom,
    bassPulse: clamp01(bass * 0.68 + beatPulse * 0.32),
    mid,
    structuralDeformation: clamp01(mid * (0.55 + safeSettings.energy * 0.65)),
    treble,
    fineDetail: clamp01(treble * (0.62 + safeSettings.sensitivity * 0.72)),
    beatPulse,
    motion: effectiveMotion,
    starTravel: reducedMotion ? 0 : wrap(finiteOr(elapsed, 0) * 0.00012 * (0.7 + safeSettings.motion), 1),
    radialLight: clamp01(bass * 0.62 + clamp01(frame.volume) * 0.2 + beatPulse * 0.58),
    density: safeSettings.density,
    glow: clamp01(safeSettings.glow * (0.72 + beatPulse * 0.45)),
    background: safeSettings.background,
    radialIterations,
    detailIterations,
    reducedMotion: reducedMotion ? 1 : 0,
    backgroundColor: parseHexColor(palette.background),
    primaryColor: parseHexColor(palette.primary),
    secondaryColor: parseHexColor(palette.secondary),
    accentColor: parseHexColor(palette.accent),
  };
};

const manifest: SceneManifest & { backend: 'webgl2' } = {
  id: 'cosmic-kaleidoscope',
  kind: 'visualizer',
  apiVersion: MODULE_API_VERSION,
  backend: 'webgl2',
  version: '1.0.0',
  name: 'Cosmic Kaleidoscope',
  description: 'A seeded neon mandala that deforms with bass, mids, treble and transient beats.',
  tags: ['webgl2', 'kaleidoscope', 'cosmic', 'audio-reactive'],
  capabilities: ['audio-frame', 'canvas', 'settings'],
  entitlement: 'core',
  settingsSchema: SCENE_SETTINGS_SCHEMA,
};

interface CosmicUniformLocations {
  readonly resolution: WebGLUniformLocation | null;
  readonly time: WebGLUniformLocation | null;
  readonly seed: WebGLUniformLocation | null;
  readonly bass: WebGLUniformLocation | null;
  readonly coreScale: WebGLUniformLocation | null;
  readonly zoom: WebGLUniformLocation | null;
  readonly bassPulse: WebGLUniformLocation | null;
  readonly mid: WebGLUniformLocation | null;
  readonly structuralDeformation: WebGLUniformLocation | null;
  readonly treble: WebGLUniformLocation | null;
  readonly fineDetail: WebGLUniformLocation | null;
  readonly beatPulse: WebGLUniformLocation | null;
  readonly motion: WebGLUniformLocation | null;
  readonly starTravel: WebGLUniformLocation | null;
  readonly radialLight: WebGLUniformLocation | null;
  readonly density: WebGLUniformLocation | null;
  readonly glow: WebGLUniformLocation | null;
  readonly background: WebGLUniformLocation | null;
  readonly radialIterations: WebGLUniformLocation | null;
  readonly detailIterations: WebGLUniformLocation | null;
  readonly reducedMotion: WebGLUniformLocation | null;
  readonly backgroundColor: WebGLUniformLocation | null;
  readonly primaryColor: WebGLUniformLocation | null;
  readonly secondaryColor: WebGLUniformLocation | null;
  readonly accentColor: WebGLUniformLocation | null;
}

const uniformNames: Readonly<Record<keyof CosmicUniformLocations, string>> = {
  resolution: 'uResolution', time: 'uTime', seed: 'uSeed', bass: 'uBass', coreScale: 'uCoreScale', zoom: 'uZoom',
  bassPulse: 'uBassPulse', mid: 'uMid', structuralDeformation: 'uStructuralDeformation', treble: 'uTreble',
  fineDetail: 'uFineDetail', beatPulse: 'uBeatPulse', motion: 'uMotion', starTravel: 'uStarTravel', radialLight: 'uRadialLight', density: 'uDensity', glow: 'uGlow',
  background: 'uBackground', radialIterations: 'uRadialIterations', detailIterations: 'uDetailIterations',
  reducedMotion: 'uReducedMotion', backgroundColor: 'uBackgroundColor', primaryColor: 'uPrimaryColor',
  secondaryColor: 'uSecondaryColor', accentColor: 'uAccentColor',
};

const readUniformLocations = (gl: WebGL2RenderingContext, program: WebGLProgram): CosmicUniformLocations => {
  const locations = {} as Record<keyof CosmicUniformLocations, WebGLUniformLocation | null>;
  for (const key of Object.keys(uniformNames) as Array<keyof CosmicUniformLocations>) {
    locations[key] = gl.getUniformLocation(program, uniformNames[key]);
  }
  return locations;
};

const setFloat = (gl: WebGL2RenderingContext, location: WebGLUniformLocation | null, value: number): void => {
  if (location) gl.uniform1f(location, value);
};

const setVec2 = (gl: WebGL2RenderingContext, location: WebGLUniformLocation | null, value: readonly [number, number]): void => {
  if (location) gl.uniform2f(location, value[0], value[1]);
};

const setVec3 = (gl: WebGL2RenderingContext, location: WebGLUniformLocation | null, value: readonly [number, number, number]): void => {
  if (location) gl.uniform3f(location, value[0], value[1], value[2]);
};

const uploadUniforms = (gl: WebGL2RenderingContext, locations: CosmicUniformLocations, uniforms: CosmicKaleidoscopeUniforms): void => {
  setVec2(gl, locations.resolution, uniforms.resolution);
  setFloat(gl, locations.time, uniforms.time);
  setFloat(gl, locations.seed, uniforms.seed);
  setFloat(gl, locations.bass, uniforms.bass);
  setFloat(gl, locations.coreScale, uniforms.coreScale);
  setFloat(gl, locations.zoom, uniforms.zoom);
  setFloat(gl, locations.bassPulse, uniforms.bassPulse);
  setFloat(gl, locations.mid, uniforms.mid);
  setFloat(gl, locations.structuralDeformation, uniforms.structuralDeformation);
  setFloat(gl, locations.treble, uniforms.treble);
  setFloat(gl, locations.fineDetail, uniforms.fineDetail);
  setFloat(gl, locations.beatPulse, uniforms.beatPulse);
  setFloat(gl, locations.motion, uniforms.motion);
  setFloat(gl, locations.starTravel, uniforms.starTravel);
  setFloat(gl, locations.radialLight, uniforms.radialLight);
  setFloat(gl, locations.density, uniforms.density);
  setFloat(gl, locations.glow, uniforms.glow);
  setFloat(gl, locations.background, uniforms.background);
  setFloat(gl, locations.radialIterations, uniforms.radialIterations);
  setFloat(gl, locations.detailIterations, uniforms.detailIterations);
  setFloat(gl, locations.reducedMotion, uniforms.reducedMotion);
  setVec3(gl, locations.backgroundColor, uniforms.backgroundColor);
  setVec3(gl, locations.primaryColor, uniforms.primaryColor);
  setVec3(gl, locations.secondaryColor, uniforms.secondaryColor);
  setVec3(gl, locations.accentColor, uniforms.accentColor);
};

const createLifecycle = (context: Parameters<WebGL2SceneModule['create']>[0]): ModuleLifecycle<WebGL2ModuleUpdateInput> => {
  const { gl } = context;
  const program = compileWebGLProgram(gl, {
    vertex: COSMIC_KALEIDOSCOPE_VERTEX_SHADER,
    fragment: COSMIC_KALEIDOSCOPE_FRAGMENT_SHADER,
  });
  let vao: WebGLVertexArrayObject | null = null;
  let vertexBuffer: WebGLBuffer | null = null;
  try {
    vao = gl.createVertexArray();
    vertexBuffer = gl.createBuffer();
    if (!vao || !vertexBuffer) throw new WebGLRuntimeError('runtime-failed', 'Cosmic Kaleidoscope could not allocate its fullscreen primitive.');

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  } catch (error) {
    if (vao) gl.deleteVertexArray(vao);
    if (vertexBuffer) gl.deleteBuffer(vertexBuffer);
    deleteWebGLProgram(gl, program);
    throw error;
  }

  const locations = readUniformLocations(gl, program);
  let destroyed = false;
  let quality: ModuleQuality = 'high';
  let reducedMotion = false;
  let pixelWidth = 1;
  let pixelHeight = 1;
  const assertAlive = (): void => {
    if (destroyed) throw new WebGLRuntimeError('runtime-failed', 'Cosmic Kaleidoscope was used after destroy.');
  };

  return {
    update: (input) => {
      assertAlive();
      const effectiveReducedMotion = reducedMotion || input.reducedMotion;
      const uniforms = mapCosmicKaleidoscopeUniforms({
        width: pixelWidth > 1 ? pixelWidth : input.width,
        height: pixelHeight > 1 ? pixelHeight : input.height,
        frame: input.frame,
        settings: effectiveReducedMotion ? { ...input.settings, motion: 0 } : input.settings,
        palette: input.palette,
        elapsed: input.elapsed,
        seed: input.seed,
        quality: input.quality ?? quality,
        reducedMotion: effectiveReducedMotion,
      });
      gl.useProgram(program);
      uploadUniforms(gl, locations, uniforms);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    },
    resize: ({ width, height, devicePixelRatio }) => {
      assertAlive();
      const ratio = Number.isFinite(devicePixelRatio) ? Math.max(1, devicePixelRatio) : 1;
      pixelWidth = Math.max(1, Math.floor(width * ratio));
      pixelHeight = Math.max(1, Math.floor(height * ratio));
      gl.viewport(0, 0, pixelWidth, pixelHeight);
    },
    setQuality: (nextQuality) => {
      assertAlive();
      quality = nextQuality;
    },
    setReducedMotion: (enabled) => {
      assertAlive();
      reducedMotion = enabled;
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      if (vao) gl.deleteVertexArray(vao);
      if (vertexBuffer) gl.deleteBuffer(vertexBuffer);
      deleteWebGLProgram(gl, program);
      vao = null;
      vertexBuffer = null;
    },
  };
};

export const cosmicKaleidoscope: WebGL2SceneModule = {
  manifest,
  defaults: { energy: 0.76, sensitivity: 0.72, motion: 0.42, density: 0.72, glow: 0.86, background: 0.34 },
  create: createLifecycle,
};

export default cosmicKaleidoscope;
