import { SceneModuleRegistry } from './moduleContract';
import type { AudioFrame, ModuleQuality, Palette, SceneId, SceneSettings } from '../types';

export interface CanvasRuntimeOptions {
  canvas: HTMLCanvasElement;
  registry: SceneModuleRegistry;
  getFrame: () => AudioFrame;
  getSceneId: () => SceneId;
  getSettings: () => SceneSettings;
  getPalette: () => Palette;
  getSeed: () => number;
  onError?: (error: Error) => void;
  quality?: ModuleQuality;
  reducedMotion?: boolean;
}

export class CanvasRuntime {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;
  private readonly registry: SceneModuleRegistry;
  private readonly getFrame: CanvasRuntimeOptions['getFrame'];
  private readonly getSceneId: CanvasRuntimeOptions['getSceneId'];
  private readonly getSettings: CanvasRuntimeOptions['getSettings'];
  private readonly getPalette: CanvasRuntimeOptions['getPalette'];
  private readonly getSeed: CanvasRuntimeOptions['getSeed'];
  private readonly onError: (error: Error) => void;
  private frameHandle = 0;
  private width = 1;
  private height = 1;
  private startedAt = performance.now();
  private activeModuleId: string | null = null;
  private activeLifecycle: ReturnType<SceneModuleRegistry['create']> | null = null;
  private quality: ModuleQuality;
  private reducedMotion: boolean;

  public constructor(options: CanvasRuntimeOptions) {
    this.canvas = options.canvas;
    this.context = options.canvas.getContext('2d');
    this.registry = options.registry;
    this.getFrame = options.getFrame;
    this.getSceneId = options.getSceneId;
    this.getSettings = options.getSettings;
    this.getPalette = options.getPalette;
    this.getSeed = options.getSeed;
    this.onError = options.onError ?? (() => undefined);
    this.quality = options.quality ?? 'high';
    this.reducedMotion = options.reducedMotion ?? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  public start(): void {
    if (!this.context || this.frameHandle) return;
    try {
      this.resize();
      this.startedAt = performance.now();
      this.ensureActiveModule();
      this.frameHandle = window.requestAnimationFrame(this.renderFrame);
    } catch (error) {
      this.handleFailure(error);
    }
  }

  public resize = (): void => {
    if (!this.context) return;
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width || this.canvas.clientWidth || 640);
    this.height = Math.max(1, rect.height || this.canvas.clientHeight || 360);
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(this.width * ratio);
    this.canvas.height = Math.floor(this.height * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.activeLifecycle?.resize({ width: this.width, height: this.height, devicePixelRatio: ratio });
  };

  public setQuality = (quality: ModuleQuality): void => {
    this.quality = quality;
    this.activeLifecycle?.setQuality(quality);
  };

  public setReducedMotion = (enabled: boolean): void => {
    this.reducedMotion = enabled;
    this.activeLifecycle?.setReducedMotion(enabled);
  };

  public destroy(): void {
    if (this.frameHandle) window.cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
    this.destroyActiveModule();
  }

  private ensureActiveModule(): void {
    if (!this.context) throw new Error('Canvas 2D rendering is not available in this browser.');
    const sceneId = this.getSceneId();
    if (sceneId === this.activeModuleId && this.activeLifecycle) return;
    this.destroyActiveModule();
    this.activeLifecycle = this.registry.create(sceneId, { canvas: this.canvas, ctx: this.context });
    this.activeModuleId = sceneId;
    this.activeLifecycle.setQuality(this.quality);
    this.activeLifecycle.setReducedMotion(this.reducedMotion);
    this.activeLifecycle.resize({
      width: this.width,
      height: this.height,
      devicePixelRatio: Math.min(2, window.devicePixelRatio || 1),
    });
  }

  private destroyActiveModule(): void {
    this.activeLifecycle?.destroy();
    this.activeLifecycle = null;
    this.activeModuleId = null;
  }

  private readonly renderFrame = (now: number): void => {
    this.frameHandle = 0;
    if (!this.context) return;
    try {
      this.ensureActiveModule();
      this.activeLifecycle?.update({
        ctx: this.context,
        width: this.width,
        height: this.height,
        frame: this.getFrame(),
        settings: this.getSettings(),
        palette: this.getPalette(),
        elapsed: now - this.startedAt,
        seed: this.getSeed(),
        quality: this.quality,
        reducedMotion: this.reducedMotion,
      });
      this.frameHandle = window.requestAnimationFrame(this.renderFrame);
    } catch (error) {
      this.handleFailure(error);
    }
  };

  private handleFailure(error: unknown): void {
    if (this.frameHandle) window.cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
    this.destroyActiveModule();
    this.onError(error instanceof Error ? error : new Error('Visualizer runtime failed.'));
  }
}
