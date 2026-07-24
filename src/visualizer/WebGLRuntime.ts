import type {
  AudioFrame,
  ModuleLifecycle,
  ModuleQuality,
  Palette,
  SceneSettings,
  WebGL2ModuleCreateContext,
  WebGL2ModuleUpdateInput,
  WebGL2SceneModule,
} from '../types';

export type WebGLRuntimeErrorCode =
  | 'webgl2-unavailable'
  | 'shader-compile-failed'
  | 'program-link-failed'
  | 'context-lost'
  | 'runtime-failed';

export class WebGLRuntimeError extends Error {
  public constructor(public readonly code: WebGLRuntimeErrorCode, message: string) {
    super(message);
    this.name = 'WebGLRuntimeError';
  }
}

export class WebGL2UnavailableError extends WebGLRuntimeError {
  public constructor(message = 'WebGL2 is not available for this canvas.') {
    super('webgl2-unavailable', message);
    this.name = 'WebGL2UnavailableError';
  }
}

export class WebGLShaderCompileError extends WebGLRuntimeError {
  public constructor(public readonly stage: 'vertex' | 'fragment', message: string) {
    super('shader-compile-failed', message);
    this.name = 'WebGLShaderCompileError';
  }
}

export class WebGLProgramLinkError extends WebGLRuntimeError {
  public constructor(message: string) {
    super('program-link-failed', message);
    this.name = 'WebGLProgramLinkError';
  }
}

export class WebGLContextLostError extends WebGLRuntimeError {
  public constructor(message = 'WebGL2 context was lost; GPU resources are no longer valid.') {
    super('context-lost', message);
    this.name = 'WebGLContextLostError';
  }
}

export interface WebGLProgramSources {
  vertex: string;
  fragment: string;
}

export const compileWebGLProgram = (gl: WebGL2RenderingContext, sources: WebGLProgramSources): WebGLProgram => {
  const compile = (type: number, stage: 'vertex' | 'fragment', source: string): WebGLShader => {
    const shader = gl.createShader(type);
    if (!shader) throw new WebGLShaderCompileError(stage, 'could not allocate a shader object.');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) ?? 'unknown shader compiler error';
      gl.deleteShader(shader);
      throw new WebGLShaderCompileError(stage, log);
    }
    return shader;
  };

  let vertex: WebGLShader | null = null;
  let fragment: WebGLShader | null = null;
  let program: WebGLProgram | null = null;
  try {
    vertex = compile(gl.VERTEX_SHADER, 'vertex', sources.vertex);
    fragment = compile(gl.FRAGMENT_SHADER, 'fragment', sources.fragment);
    program = gl.createProgram();
    if (!program) throw new WebGLProgramLinkError('could not allocate a program object.');
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? 'unknown program linker error';
      throw new WebGLProgramLinkError(log);
    }
    return program;
  } catch (error) {
    if (program) gl.deleteProgram(program);
    throw error;
  } finally {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
  }
};

export const deleteWebGLProgram = (gl: WebGL2RenderingContext, program: WebGLProgram | null): void => {
  if (program) gl.deleteProgram(program);
};

export interface WebGLRuntimeResources {
  draw: () => void;
  destroy: () => void;
}

export type WebGLResourceFactory = (gl: WebGL2RenderingContext) => WebGLRuntimeResources;

export const DEFAULT_WEBGL_PROGRAM_SOURCES: WebGLProgramSources = {
  vertex: `#version 300 es
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`,
  fragment: `#version 300 es
precision highp float;
out vec4 outColor;
void main() { outColor = vec4(0.0, 0.0, 0.0, 1.0); }`,
};

export const createWebGLRuntimeResources = (
  gl: WebGL2RenderingContext,
  sources: WebGLProgramSources = DEFAULT_WEBGL_PROGRAM_SOURCES,
): WebGLRuntimeResources => {
  const program = compileWebGLProgram(gl, sources);
  const buffer = gl.createBuffer();
  if (!buffer) {
    gl.deleteProgram(program);
    throw new WebGLRuntimeError('runtime-failed', 'WebGL2 could not allocate the runtime vertex buffer.');
  }
  const position = gl.getAttribLocation(program, 'a_position');
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  let destroyed = false;
  return {
    draw: () => {
      if (destroyed) return;
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      if (position >= 0) {
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    },
  };
};

export interface WebGLRuntimeOptions {
  canvas: HTMLCanvasElement;
  module: WebGL2SceneModule;
  getFrame: () => AudioFrame;
  getSettings: () => SceneSettings;
  getPalette: () => Palette;
  getSeed: () => number;
  onError?: (error: WebGLRuntimeError) => void;
  quality?: ModuleQuality;
  reducedMotion?: boolean;
  devicePixelRatioCap?: number;
  resourceFactory?: WebGLResourceFactory;
  programSources?: WebGLProgramSources;
  windowRef?: Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame' | 'devicePixelRatio' | 'addEventListener' | 'removeEventListener'>;
}

export class WebGLRuntime {
  private readonly canvas: HTMLCanvasElement;
  private readonly module: WebGL2SceneModule;
  private readonly getFrame: WebGLRuntimeOptions['getFrame'];
  private readonly getSettings: WebGLRuntimeOptions['getSettings'];
  private readonly getPalette: WebGLRuntimeOptions['getPalette'];
  private readonly getSeed: WebGLRuntimeOptions['getSeed'];
  private readonly onError: (error: WebGLRuntimeError) => void;
  private readonly dprCap: number;
  private readonly windowRef: NonNullable<WebGLRuntimeOptions['windowRef']>;
  private gl: WebGL2RenderingContext | null = null;
  private lifecycle: ModuleLifecycle<WebGL2ModuleUpdateInput> | null = null;
  private frameHandle = 0;
  private startedAt = 0;
  private width = 1;
  private height = 1;
  private quality: ModuleQuality;
  private reducedMotion: boolean;
  private readonly resourceFactory: WebGLResourceFactory;
  private resources: WebGLRuntimeResources | null = null;
  private initialized = false;
  private destroyed = false;
  private failed = false;

  public constructor(options: WebGLRuntimeOptions) {
    this.canvas = options.canvas;
    this.module = options.module;
    this.getFrame = options.getFrame;
    this.getSettings = options.getSettings;
    this.getPalette = options.getPalette;
    this.getSeed = options.getSeed;
    this.onError = options.onError ?? (() => undefined);
    this.quality = options.quality ?? 'high';
    this.reducedMotion = options.reducedMotion ?? false;
    this.dprCap = Math.max(1, Math.min(3, options.devicePixelRatioCap ?? 2));
    this.resourceFactory = options.resourceFactory ?? ((gl) => createWebGLRuntimeResources(gl, options.programSources));
    this.windowRef = options.windowRef ?? window;
    this.canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
    this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);
  }

  public start(): void {
    if (this.destroyed || this.failed || this.initialized) return;
    this.initialized = true;
    try {
      this.gl = this.canvas.getContext('webgl2');
      if (!this.gl) throw new WebGL2UnavailableError();
      this.resources = this.resourceFactory(this.gl);
      const context: WebGL2ModuleCreateContext = { backend: 'webgl2', canvas: this.canvas, gl: this.gl };
      this.lifecycle = this.module.create(context);
      this.resize();
      this.lifecycle.setQuality(this.quality);
      this.lifecycle.setReducedMotion(this.reducedMotion);
      this.startedAt = this.now();
      this.frameHandle = this.windowRef.requestAnimationFrame(this.renderFrame);
    } catch (error) {
      this.handleFailure(error);
    }
  }

  public resize = (): void => {
    if (!this.gl || this.destroyed || this.failed) return;
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width || this.canvas.clientWidth || 640);
    this.height = Math.max(1, rect.height || this.canvas.clientHeight || 360);
    const ratio = Math.min(this.dprCap, Math.max(1, this.windowRef.devicePixelRatio || 1));
    this.canvas.width = Math.floor(this.width * ratio);
    this.canvas.height = Math.floor(this.height * ratio);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.lifecycle?.resize({ width: this.width, height: this.height, devicePixelRatio: ratio });
  };

  public setQuality = (quality: ModuleQuality): void => {
    this.quality = quality;
    this.lifecycle?.setQuality(quality);
  };

  public setReducedMotion = (enabled: boolean): void => {
    this.reducedMotion = enabled;
    this.lifecycle?.setReducedMotion(enabled);
  };
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopFrameLoop();
    try {
      this.lifecycle?.destroy();
    } catch {
      // A module must not prevent the runtime from releasing its own GPU handles.
    } finally {
      this.lifecycle = null;
      this.destroyResources();
      this.gl = null;
      this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
      this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    }
  }

  private readonly renderFrame = (now: number): void => {
    if (this.destroyed || this.failed || !this.gl || !this.lifecycle) {
      this.frameHandle = 0;
      return;
    }
    try {
      if (typeof this.gl.isContextLost === 'function' && this.gl.isContextLost()) {
        throw new WebGLContextLostError();
      }
      this.lifecycle.update({
        backend: 'webgl2', gl: this.gl, width: this.width, height: this.height,
        frame: this.getFrame(), settings: this.getSettings(), palette: this.getPalette(),
        elapsed: now - this.startedAt, seed: this.getSeed(), quality: this.quality,
        reducedMotion: this.reducedMotion,
      });
      this.resources?.draw();
      this.frameHandle = this.windowRef.requestAnimationFrame(this.renderFrame);
    } catch (error) {
      this.handleFailure(error);
    }
  };

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.handleFailure(new WebGLContextLostError());
  };

  private readonly handleContextRestored = (): void => {
    if (!this.destroyed) this.handleFailure(new WebGLContextLostError('WebGL2 context was restored, but the runtime requires a clean reinitialization.'));
  };

  private handleFailure(error: unknown): void {
    if (this.failed || this.destroyed) return;
    this.failed = true;
    this.stopFrameLoop();
    try {
      this.lifecycle?.destroy();
    } catch {
      // A module must not prevent the runtime from releasing its own GPU handles.
    } finally {
      this.lifecycle = null;
      this.destroyResources();
    }
    const normalized = error instanceof WebGLRuntimeError
      ? error
      : new WebGLRuntimeError('runtime-failed', error instanceof Error ? error.message : 'WebGL2 runtime failed.');
    this.onError(normalized);
  }

  private stopFrameLoop(): void {
    if (this.frameHandle) this.windowRef.cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
  }

  private destroyResources(): void {
    const resources = this.resources;
    this.resources = null;
    try {
      resources?.destroy();
    } catch {
      // Cleanup is best effort after a lost context; the context owns the invalid handles.
    }
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }
}
