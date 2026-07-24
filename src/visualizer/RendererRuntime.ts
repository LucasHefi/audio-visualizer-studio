import { CanvasRuntime, type CanvasRuntimeOptions } from './CanvasRuntime';
import { WebGLRuntime } from './WebGLRuntime';
import type { WebGL2SceneModule } from '../types';

export type RendererRuntimeOptions = CanvasRuntimeOptions;

/** Selects the renderer from the validated scene manifest; it never silently falls back across backends. */
export class RendererRuntime {
  private readonly runtime: CanvasRuntime | WebGLRuntime;

  public constructor(options: RendererRuntimeOptions) {
    const module = options.registry.require(options.getSceneId());
    if (module.manifest.backend === 'webgl2') {
      this.runtime = new WebGLRuntime({
        canvas: options.canvas,
        module: module as WebGL2SceneModule,
        getFrame: options.getFrame,
        getSettings: options.getSettings,
        getPalette: options.getPalette,
        getSeed: options.getSeed,
        onError: options.onError,
        quality: options.quality,
        reducedMotion: options.reducedMotion,
        resourceFactory: () => ({ draw: () => undefined, destroy: () => undefined }),
      });
    } else {
      this.runtime = new CanvasRuntime(options);
    }
  }

  public start(): void { this.runtime.start(); }
  public resize(): void { this.runtime.resize(); }
  public setQuality(quality: Parameters<CanvasRuntime['setQuality']>[0]): void { this.runtime.setQuality(quality); }
  public setReducedMotion(enabled: boolean): void { this.runtime.setReducedMotion(enabled); }
  public destroy(): void { this.runtime.destroy(); }
}
