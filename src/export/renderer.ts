import type { AudioFrame, Canvas2DModuleUpdateInput, Canvas2DSceneModule, Canvas2DRenderingContext, ModuleLifecycle, ModuleQuality, Palette, RendererCanvas, SceneModule, SceneSettings, WebGL2ModuleUpdateInput, WebGL2SceneModule } from '../types';
import { ExportValidationError } from './types';

export interface ExportRendererLayer {
  readonly id: string;
  readonly module: SceneModule;
  readonly palette: Palette;
  readonly settings: SceneSettings;
  readonly seed: number;
}

export interface ExportRendererOptions {
  readonly canvas: OffscreenCanvas;
  readonly layers: readonly ExportRendererLayer[];
  readonly width: number;
  readonly height: number;
  readonly quality: ModuleQuality;
  readonly reducedMotion: boolean;
}

export interface ExportRenderedFrame {
  readonly videoFrame: VideoFrame;
  readonly close: () => void;
}

interface LayerRuntime {
  readonly layer: ExportRendererLayer;
  readonly canvas: OffscreenCanvas;
  readonly ctx2d: Canvas2DRenderingContext | null;
  readonly gl: WebGL2RenderingContext | null;
  readonly canvasLifecycle: ModuleLifecycle<Canvas2DModuleUpdateInput> | null;
  readonly webglLifecycle: ModuleLifecycle<WebGL2ModuleUpdateInput> | null;
}

const asRendererCanvas = (canvas: OffscreenCanvas): RendererCanvas => canvas;

const createLayerRuntime = (
  layer: ExportRendererLayer,
  width: number,
  height: number,
  quality: ModuleQuality,
  reducedMotion: boolean,
): LayerRuntime => {
  const canvas = new OffscreenCanvas(width, height);
  if (layer.module.manifest.backend === 'canvas2d') {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new ExportValidationError('RENDERER_UNAVAILABLE', `Canvas2D export context is unavailable for layer ${layer.id}.`);
    const canvasModule = layer.module as Canvas2DSceneModule;
    const lifecycle = canvasModule.create
      ? canvasModule.create({ backend: 'canvas2d', canvas: asRendererCanvas(canvas), ctx })
      : null;
    lifecycle?.setQuality(quality);
    lifecycle?.setReducedMotion(reducedMotion);
    lifecycle?.resize({ width, height, devicePixelRatio: 1 });
    return { layer, canvas, ctx2d: ctx, gl: null, canvasLifecycle: lifecycle, webglLifecycle: null };
  }

  const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
  if (!gl) throw new ExportValidationError('RENDERER_UNAVAILABLE', `WebGL2 export context is unavailable for layer ${layer.id}.`);
  const lifecycle = (layer.module as WebGL2SceneModule).create({ backend: 'webgl2', canvas: asRendererCanvas(canvas), gl });
  lifecycle.setQuality(quality);
  lifecycle.setReducedMotion(reducedMotion);
  lifecycle.resize({ width, height, devicePixelRatio: 1 });
  return { layer, canvas, ctx2d: null, gl, canvasLifecycle: null, webglLifecycle: lifecycle };
};

export class DeterministicExportRenderer {
  private readonly canvas: OffscreenCanvas;
  private readonly width: number;
  private readonly height: number;
  private readonly outputContext: Canvas2DRenderingContext;
  private readonly layers: readonly LayerRuntime[];
  private readonly quality: ModuleQuality;
  private readonly reducedMotion: boolean;
  private destroyed = false;

  public constructor(options: ExportRendererOptions) {
    if (options.layers.length === 0) throw new ExportValidationError('NO_ACTIVE_LAYERS', 'At least one active visual layer is required for export.');
    this.canvas = options.canvas;
    this.width = options.width;
    this.height = options.height;
    this.quality = options.quality;
    this.reducedMotion = options.reducedMotion;
    this.canvas.width = options.width;
    this.canvas.height = options.height;
    const outputContext = this.canvas.getContext('2d', { alpha: false });
    if (!outputContext) throw new ExportValidationError('RENDERER_UNAVAILABLE', 'Export compositor context is unavailable.');
    this.outputContext = outputContext;
    this.layers = options.layers.map((layer) => createLayerRuntime(layer, options.width, options.height, options.quality, options.reducedMotion));
  }

  public render(frame: { timestamp: number; duration: number; audioFrame: AudioFrame }): ExportRenderedFrame {
    if (this.destroyed) throw new ExportValidationError('RENDERER_UNAVAILABLE', 'Export renderer was already destroyed.');
    const elapsed = frame.timestamp * 1000;
    for (const runtime of this.layers) {
      if (runtime.ctx2d) {
        runtime.ctx2d.save();
        runtime.ctx2d.globalAlpha = 1;
        runtime.ctx2d.globalCompositeOperation = 'source-over';
        runtime.ctx2d.clearRect(0, 0, this.width, this.height);
        if (runtime.canvasLifecycle) {
          runtime.canvasLifecycle.update({
            backend: 'canvas2d',
            ctx: runtime.ctx2d,
            width: this.width,
            height: this.height,
            frame: frame.audioFrame,
            settings: runtime.layer.settings,
            palette: runtime.layer.palette,
            elapsed,
            seed: runtime.layer.seed,
            quality: this.quality,
            reducedMotion: this.reducedMotion,
          });
        } else {
          (runtime.layer.module as Canvas2DSceneModule).render(
            runtime.ctx2d,
            this.width,
            this.height,
            frame.audioFrame,
            runtime.layer.settings,
            runtime.layer.palette,
            elapsed,
            runtime.layer.seed,
          );
        }
        runtime.ctx2d.restore();
      } else if (runtime.gl && runtime.webglLifecycle) {
        runtime.webglLifecycle.update({
          backend: 'webgl2',
          gl: runtime.gl,
          width: this.width,
          height: this.height,
          frame: frame.audioFrame,
          settings: runtime.layer.settings,
          palette: runtime.layer.palette,
          elapsed,
          seed: runtime.layer.seed,
          quality: 'high',
          reducedMotion: false,
        });
      } else {
        throw new ExportValidationError('RENDERER_UNAVAILABLE', `Export layer ${runtime.layer.id} has no rendering context.`);
      }
    }

    this.outputContext.save();
    this.outputContext.globalAlpha = 1;
    this.outputContext.globalCompositeOperation = 'source-over';
    this.outputContext.clearRect(0, 0, this.width, this.height);
    this.layers.forEach((runtime, index) => {
      this.outputContext.globalAlpha = index === 0 ? 1 : 0.84;
      this.outputContext.globalCompositeOperation = index === 0 ? 'source-over' : 'screen';
      this.outputContext.drawImage(runtime.canvas, 0, 0, this.width, this.height);
    });
    this.outputContext.restore();

    const timestamp = Math.round(frame.timestamp * 1_000_000);
    const videoFrame = new VideoFrame(this.canvas, { timestamp, duration: Math.max(1, Math.round(frame.duration * 1_000_000)) });
    return { videoFrame, close: () => videoFrame.close() };
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const runtime of this.layers) {
      runtime.canvasLifecycle?.destroy();
      runtime.webglLifecycle?.destroy();
    }
  }
}

export const createExportCanvas = (width: number, height: number): OffscreenCanvas => {
  if (typeof OffscreenCanvas === 'undefined') throw new ExportValidationError('RENDERER_UNAVAILABLE', 'OffscreenCanvas is unavailable in this browser.');
  return new OffscreenCanvas(width, height);
};
