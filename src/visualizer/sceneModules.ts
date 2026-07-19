import { clamp } from '../core/audioMath';
import { SCENE_SETTINGS_SCHEMA } from '../core/settingsSchema';
import { createSceneRegistry } from './moduleContract';
import { MODULE_API_VERSION, type AudioFrame, type ModuleLifecycle, type ModuleQuality, type Palette, type SceneManifest, type SceneModule, type SceneSettings } from '../types';

const createManifest = (id: SceneManifest['id'], name: string, description: string, tags: readonly string[]): SceneManifest => ({
  id,
  kind: 'visualizer',
  apiVersion: MODULE_API_VERSION,
  version: '1.0.0',
  name,
  description,
  tags,
  capabilities: ['audio-frame', 'canvas', 'settings'],
  entitlement: 'core',
  settingsSchema: SCENE_SETTINGS_SCHEMA,
});

const hexToRgba = (hex: string, alpha: number): string => {
  const clean = hex.replace('#', '');
  const value = clean.length === 3
    ? clean.split('').map((part) => `${part}${part}`).join('')
    : clean;
  const number = Number.parseInt(value, 16);
  const red = (number >> 16) & 255;
  const green = (number >> 8) & 255;
  const blue = number & 255;
  return `rgba(${red}, ${green}, ${blue}, ${clamp(alpha)})`;
};

const seeded = (seed: number, index: number): number => {
  const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

const paintBackground = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: Palette,
  strength: number,
) => {
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(width * 0.5, height * 0.42, 0, width * 0.5, height * 0.42, Math.max(width, height) * 0.78);
  glow.addColorStop(0, hexToRgba(palette.surface, 0.52 * strength));
  glow.addColorStop(0.56, hexToRgba(palette.background, 0.18));
  glow.addColorStop(1, hexToRgba(palette.background, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
};

const ORBITAL_QUALITY_SCALE: Record<ModuleQuality, number> = { high: 1, balanced: 0.72, low: 0.45 };

export type OrbitalParticleColor = 0 | 1 | 2;

export interface OrbitalParticle {
  orbit: number;
  angle: number;
  wobblePhase: number;
  direction: -1 | 1;
  baseSize: number;
  colorIndex: OrbitalParticleColor;
}

export const getOrbitalParticleCount = (density: number, quality: ModuleQuality): number => {
  const baseCount = Math.min(144, Math.max(28, Math.floor(28 + clamp(density) * 150)));
  return Math.max(16, Math.floor(baseCount * ORBITAL_QUALITY_SCALE[quality]));
};

export const createOrbitalParticles = (seed: number, count: number): OrbitalParticle[] => Array.from({ length: Math.max(0, Math.floor(count)) }, (_, index) => ({
  orbit: 0.5 + seeded(seed, index) * 1.2,
  angle: seeded(seed + 7, index) * Math.PI * 2,
  wobblePhase: seeded(seed + 19, index) * Math.PI * 2,
  direction: index % 2 ? 1 : -1,
  baseSize: 1.5 + seeded(seed + 11, index) * 3,
  colorIndex: (index % 3) as OrbitalParticleColor,
}));

export class OrbitalParticleCache {
  private seed: number | null = null;
  private count = -1;
  private particles: OrbitalParticle[] = [];

  public get(seed: number, count: number): readonly OrbitalParticle[] {
    if (seed !== this.seed || count !== this.count) {
      this.seed = seed;
      this.count = count;
      this.particles = createOrbitalParticles(seed, count);
    }
    return this.particles;
  }

  public clear(): void {
    this.seed = null;
    this.count = -1;
    this.particles = [];
  }
}

const orbitalColors = (palette: Palette): readonly string[] => [palette.accent, palette.primary, palette.secondary];

export const renderOrbitalFrame = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: AudioFrame,
  settings: SceneSettings,
  palette: Palette,
  elapsed: number,
  particles: readonly OrbitalParticle[],
  quality: ModuleQuality,
  reducedMotion: boolean,
): void => {
  paintBackground(ctx, width, height, palette, 0.62 + settings.background * 0.5);
  const centerX = width * 0.5;
  const centerY = height * 0.52;
  const radius = Math.min(width, height) * (0.12 + frame.bassEnergy * settings.energy * 0.18);
  const motion = reducedMotion ? 0 : settings.motion;
  const rotation = elapsed * 0.00018 * motion;
  const sizeScale = 0.85 + frame.trebleEnergy * 1.4 * settings.sensitivity;
  const shadowBlur = 12 * settings.glow * (quality === 'low' ? 0.55 : quality === 'balanced' ? 0.75 : 1);
  const colors = orbitalColors(palette);

  ctx.globalCompositeOperation = 'lighter';
  for (let colorIndex = 0; colorIndex < colors.length; colorIndex += 1) {
    const color = colors[colorIndex];
    ctx.beginPath();
    for (const particle of particles) {
      if (particle.colorIndex !== colorIndex) continue;
      const angle = particle.angle + rotation * particle.direction;
      const wobble = reducedMotion
        ? 0
        : Math.sin(elapsed * 0.001 * motion + particle.wobblePhase) * radius * 0.12;
      const x = centerX + Math.cos(angle) * radius * particle.orbit + wobble;
      const y = centerY + Math.sin(angle) * radius * particle.orbit * 0.72;
      const size = particle.baseSize * sizeScale;
      ctx.moveTo(x + size, y);
      ctx.arc(x, y, size, 0, Math.PI * 2);
    }
    ctx.fillStyle = color;
    ctx.shadowBlur = shadowBlur;
    ctx.shadowColor = color;
    ctx.fill();
  }

  ctx.shadowBlur = 0;
  ctx.strokeStyle = hexToRgba(palette.primary, 0.16 + frame.beatPulse * 0.4);
  ctx.lineWidth = Math.max(1, width / 480);
  const ringCount = quality === 'high' ? 4 : quality === 'balanced' ? 3 : 2;
  for (let ring = 1; ring <= ringCount; ring += 1) {
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radius * ring * 0.55, radius * ring * 0.36, rotation * ring, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
};

export const createOrbitalLifecycle = (): ModuleLifecycle => {
  const cache = new OrbitalParticleCache();
  let destroyed = false;
  let quality: ModuleQuality = 'high';
  let reducedMotion = false;

  const assertAlive = () => {
    if (destroyed) throw new Error('Orbital module was updated after destroy.');
  };

  return {
    update: (input) => {
      assertAlive();
      const effectiveReducedMotion = reducedMotion || input.reducedMotion;
      const effectiveSettings = effectiveReducedMotion ? { ...input.settings, motion: 0 } : input.settings;
      const effectiveQuality = input.quality ?? quality;
      const particles = cache.get(input.seed, getOrbitalParticleCount(effectiveSettings.density, effectiveQuality));
      renderOrbitalFrame(input.ctx, input.width, input.height, input.frame, effectiveSettings, input.palette, input.elapsed, particles, effectiveQuality, effectiveReducedMotion);
    },
    resize: () => assertAlive(),
    setQuality: (nextQuality) => { assertAlive(); quality = nextQuality; },
    setReducedMotion: (enabled) => { assertAlive(); reducedMotion = enabled; },
    destroy: () => { destroyed = true; cache.clear(); },
  };
};

const spectrum: SceneModule = {
  manifest: createManifest('spectrum', 'Spectrum', 'Crisp frequency columns that follow the pulse.', ['frequency', 'graphic', 'responsive']),
  defaults: { energy: 0.72, sensitivity: 0.68, motion: 0.52, density: 0.58, glow: 0.7, background: 0.45 },
  render: (ctx, width, height, frame, settings, palette, elapsed) => {
    paintBackground(ctx, width, height, palette, 0.8 + settings.background * 0.4);
    const bars = Math.max(24, Math.floor(24 + settings.density * 72));
    const gap = Math.max(2, width / bars * 0.22);
    const barWidth = Math.max(2, (width - gap * (bars + 1)) / bars);
    const center = height * 0.54;
    const maxHeight = height * (0.22 + settings.energy * 0.46);
    const pulse = frame.beatPulse * settings.motion * 0.22;
    const gradient = ctx.createLinearGradient(0, height, width, 0);
    gradient.addColorStop(0, palette.secondary);
    gradient.addColorStop(0.5, palette.primary);
    gradient.addColorStop(1, palette.accent);
    ctx.shadowBlur = 16 * settings.glow;
    ctx.shadowColor = hexToRgba(palette.primary, 0.7);
    ctx.fillStyle = gradient;
    for (let index = 0; index < bars; index += 1) {
      const bin = Math.floor((index / bars) * frame.frequencyBins.length * 0.92);
      const energy = (frame.frequencyBins[bin] ?? 0) / 255;
      const wave = 0.86 + Math.sin(elapsed * 0.001 * settings.motion + index * 0.34) * 0.08;
      const barHeight = Math.max(4, maxHeight * clamp(energy * settings.sensitivity * 1.5 + pulse) * wave);
      const x = gap + index * (barWidth + gap);
      ctx.fillRect(x, center - barHeight, barWidth, barHeight);
      ctx.fillRect(x, center + 8, barWidth, Math.max(3, barHeight * 0.32));
    }
    ctx.shadowBlur = 0;
    ctx.strokeStyle = hexToRgba(palette.accent, 0.42);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(width * 0.08, center + 2);
    ctx.lineTo(width * 0.92, center + 2);
    ctx.stroke();
  },
};

const waveform: SceneModule = {
  manifest: createManifest('waveform', 'Waveform', 'A luminous ribbon with an organic audio contour.', ['wave', 'organic', 'line']),
  defaults: { energy: 0.76, sensitivity: 0.72, motion: 0.4, density: 0.5, glow: 0.82, background: 0.5 },
  render: (ctx, width, height, frame, settings, palette, elapsed) => {
    paintBackground(ctx, width, height, palette, 0.9 + settings.background * 0.3);
    const center = height * 0.5;
    const amplitude = height * (0.16 + frame.volume * settings.energy * 0.33);
    const points = Math.max(80, Math.floor(width / 7));
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, palette.secondary);
    gradient.addColorStop(0.47, palette.primary);
    gradient.addColorStop(1, palette.accent);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = Math.max(2, width / 260);
    ctx.lineCap = 'round';
    ctx.shadowBlur = 24 * settings.glow;
    ctx.shadowColor = hexToRgba(palette.primary, 0.72);
    for (let layer = 0; layer < 3; layer += 1) {
      ctx.globalAlpha = layer === 0 ? 0.95 : 0.18 / layer;
      ctx.beginPath();
      for (let index = 0; index <= points; index += 1) {
        const x = (index / points) * width;
        const bin = Math.floor((index / points) * frame.waveform.length);
        const sample = ((frame.waveform[bin] ?? 128) - 128) / 128;
        const shimmer = Math.sin(elapsed * 0.001 * settings.motion + index * 0.14) * 0.04;
        const y = center + (sample + shimmer) * amplitude * (1 - layer * 0.13);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.fillStyle = hexToRgba(palette.primary, 0.05);
    ctx.fillRect(0, center - amplitude, width, amplitude * 2);
  },
};

const orbital: SceneModule = {
  manifest: createManifest('orbital', 'Orbital', 'Layered particles and rings expanding with low frequencies.', ['particles', 'orbit', 'depth']),
  defaults: { energy: 0.7, sensitivity: 0.62, motion: 0.62, density: 0.7, glow: 0.78, background: 0.28 },
  render: (ctx, width, height, frame, settings, palette, elapsed, seed) => {
    const cache = new OrbitalParticleCache();
    renderOrbitalFrame(ctx, width, height, frame, settings, palette, elapsed, cache.get(seed, getOrbitalParticleCount(settings.density, 'high')), 'high', false);
  },
  create: () => createOrbitalLifecycle(),
};

const fluidGlow: SceneModule = {
  manifest: createManifest('fluid-glow', 'Fluid Glow', 'Slow clouds of light for atmospheric mixes.', ['ambient', 'glow', 'slow']),
  defaults: { energy: 0.64, sensitivity: 0.55, motion: 0.25, density: 0.46, glow: 0.92, background: 0.62 },
  render: (ctx, width, height, frame, settings, palette, elapsed, seed) => {
    paintBackground(ctx, width, height, palette, 1.1 + settings.background * 0.25);
    ctx.globalCompositeOperation = 'screen';
    const blobs = Math.max(3, Math.floor(3 + settings.density * 8));
    for (let index = 0; index < blobs; index += 1) {
      const baseX = 0.15 + seeded(seed, index) * 0.7;
      const baseY = 0.15 + seeded(seed + 50, index) * 0.7;
      const drift = elapsed * 0.00003 * settings.motion * (index % 2 ? -1 : 1);
      const x = (baseX + Math.sin(drift + index) * 0.16) * width;
      const y = (baseY + Math.cos(drift * 1.4 + index) * 0.16) * height;
      const spread = Math.min(width, height) * (0.18 + frame.midEnergy * settings.energy * 0.22);
      const color = index % 3 === 0 ? palette.primary : index % 2 === 0 ? palette.secondary : palette.accent;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, spread);
      gradient.addColorStop(0, hexToRgba(color, 0.22 + frame.volume * 0.24));
      gradient.addColorStop(0.4, hexToRgba(color, 0.1 * settings.glow));
      gradient.addColorStop(1, hexToRgba(color, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, spread, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    const horizon = ctx.createLinearGradient(0, height * 0.55, width, height);
    horizon.addColorStop(0, hexToRgba(palette.primary, 0));
    horizon.addColorStop(1, hexToRgba(palette.secondary, 0.12 + frame.beatPulse * 0.16));
    ctx.fillStyle = horizon;
    ctx.fillRect(0, height * 0.5, width, height * 0.5);
  },
};

export const SCENE_MODULES: Record<string, SceneModule> = {
  spectrum,
  waveform,
  orbital,
  'fluid-glow': fluidGlow,
};

export const SCENE_LIST = Object.values(SCENE_MODULES);
export const SCENE_REGISTRY = createSceneRegistry(SCENE_LIST);
export const AVAILABLE_SCENE_LIST = SCENE_REGISTRY.list();
