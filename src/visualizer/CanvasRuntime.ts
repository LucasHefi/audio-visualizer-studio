import { SCENE_MODULES } from './sceneModules';
import type { AudioFrame, Palette, SceneId, SceneSettings } from '../types';

interface CanvasRuntimeOptions {
  canvas: HTMLCanvasElement;
  getFrame: () => AudioFrame;
  getSceneId: () => SceneId;
  getSettings: () => SceneSettings;
  getPalette: () => Palette;
  getSeed: () => number;
}

export class CanvasRuntime {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;
  private readonly getFrame: CanvasRuntimeOptions['getFrame'];
  private readonly getSceneId: CanvasRuntimeOptions['getSceneId'];
  private readonly getSettings: CanvasRuntimeOptions['getSettings'];
  private readonly getPalette: CanvasRuntimeOptions['getPalette'];
  private readonly getSeed: CanvasRuntimeOptions['getSeed'];
  private frameHandle = 0;
  private width = 1;
  private height = 1;
  private startedAt = performance.now();

  public constructor(options: CanvasRuntimeOptions) {
    this.canvas = options.canvas;
    this.context = options.canvas.getContext('2d');
    this.getFrame = options.getFrame;
    this.getSceneId = options.getSceneId;
    this.getSettings = options.getSettings;
    this.getPalette = options.getPalette;
    this.getSeed = options.getSeed;
  }

  public start(): void {
    if (!this.context) return;
    this.resize();
    this.startedAt = performance.now();
    this.frameHandle = window.requestAnimationFrame(this.renderFrame);
  }

  public resize = (): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width || this.canvas.clientWidth || 640);
    this.height = Math.max(1, rect.height || this.canvas.clientHeight || 360);
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(this.width * ratio);
    this.canvas.height = Math.floor(this.height * ratio);
    this.context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  public destroy(): void {
    if (this.frameHandle) window.cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
  }

  private readonly renderFrame = (now: number): void => {
    if (!this.context) return;
    const scene = SCENE_MODULES[this.getSceneId()] ?? SCENE_MODULES.spectrum;
    scene.render(this.context, this.width, this.height, this.getFrame(), this.getSettings(), this.getPalette(), now - this.startedAt, this.getSeed());
    this.frameHandle = window.requestAnimationFrame(this.renderFrame);
  };
}
