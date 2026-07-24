import { describe, expect, it, vi } from 'vitest';
import type { AudioFrame, ModuleLifecycle, Palette, SceneSettings, WebGL2SceneModule } from '../types';
import {
  WebGL2UnavailableError,
  WebGLContextLostError,
  WebGLProgramLinkError,
  WebGLRuntime,
  WebGLShaderCompileError,
  compileWebGLProgram,
} from './WebGLRuntime';

const frame: AudioFrame = { frequencyBins: [], waveform: [], bassEnergy: 0, midEnergy: 0, trebleEnergy: 0, volume: 0, beatPulse: 0 };
const settings: SceneSettings = { energy: 0.5, sensitivity: 0.5, motion: 0.5, density: 0.5, glow: 0.5, background: 0.5 };
const palette = {} as Palette;

const makeGl = (overrides: Record<string, unknown> = {}): WebGL2RenderingContext => ({
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
  createBuffer: vi.fn(() => ({})),
  deleteBuffer: vi.fn(),
  bindBuffer: vi.fn(),
  bufferData: vi.fn(),
  getAttribLocation: vi.fn(() => 0),
  enableVertexAttribArray: vi.fn(),
  vertexAttribPointer: vi.fn(),
  useProgram: vi.fn(),
  drawArrays: vi.fn(),
  viewport: vi.fn(),
  ...overrides,
} as unknown as WebGL2RenderingContext);

const makeCanvas = (gl: WebGL2RenderingContext | null, dimensions = { width: 640, height: 360 }): HTMLCanvasElement => ({
  width: 0,
  height: 0,
  clientWidth: 640,
  clientHeight: 360,
  getBoundingClientRect: () => ({ width: dimensions.width, height: dimensions.height } as DOMRect),
  getContext: vi.fn(() => gl),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
} as unknown as HTMLCanvasElement);

const makeWindow = () => {
  let nextHandle = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  return {
    devicePixelRatio: 2,
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => { const handle = ++nextHandle; callbacks.set(handle, callback); return handle; }),
    cancelAnimationFrame: vi.fn((handle: number) => callbacks.delete(handle)),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    callbacks,
  };
};

const makeModule = (lifecycle: ModuleLifecycle<any>): WebGL2SceneModule => ({
  manifest: {
    id: 'cosmic-kaleidoscope', kind: 'visualizer', apiVersion: 1, backend: 'webgl2', version: '1.0.0',
    name: 'Cosmic Kaleidoscope', description: 'test', tags: ['test'], capabilities: ['audio-frame', 'canvas', 'settings'],
    entitlement: 'core', settingsSchema: { version: 1, fields: { energy: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01 } } },
  },
  defaults: settings,
  create: vi.fn(() => lifecycle),
});

const runtimeOptions = (canvas: HTMLCanvasElement, module: WebGL2SceneModule, windowRef: ReturnType<typeof makeWindow>) => ({
  canvas, module, windowRef, getFrame: () => frame, getSettings: () => settings, getPalette: () => palette, getSeed: () => 1,
  quality: 'low' as const, reducedMotion: true,
});

describe('WebGLRuntime', () => {
  it('initializes once, resizes with capped DPR, draws and destroys idempotently', () => {
    const gl = makeGl();
    const windowRef = makeWindow();
    const lifecycle: ModuleLifecycle<any> = { update: vi.fn(), resize: vi.fn(), setQuality: vi.fn(), setReducedMotion: vi.fn(), destroy: vi.fn() };
    const dimensions = { width: 640, height: 360 };
    const canvas = makeCanvas(gl, dimensions);
    const runtime = new WebGLRuntime(runtimeOptions(canvas, makeModule(lifecycle), windowRef));

    runtime.start();
    expect(lifecycle.resize).toHaveBeenCalledWith({ width: 640, height: 360, devicePixelRatio: 2 });
    expect(gl.viewport).toHaveBeenCalledWith(0, 0, 1280, 720);
    expect(gl.createShader).toHaveBeenCalledTimes(2);
    expect(gl.compileShader).toHaveBeenCalledTimes(2);
    expect(gl.linkProgram).toHaveBeenCalledOnce();
    expect(lifecycle.setQuality).toHaveBeenCalledWith('low');
    expect(lifecycle.setReducedMotion).toHaveBeenCalledWith(true);
    dimensions.width = 320;
    dimensions.height = 120;
    runtime.resize();
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(240);
    expect(gl.viewport).toHaveBeenCalledWith(0, 0, 640, 240);
    expect(windowRef.requestAnimationFrame).toHaveBeenCalledOnce();
    const raf = windowRef.callbacks.values().next().value as FrameRequestCallback;
    raf(100);
    expect(lifecycle.update).toHaveBeenCalledWith(expect.objectContaining({ backend: 'webgl2', quality: 'low', reducedMotion: true }));
    expect(gl.drawArrays).toHaveBeenCalledOnce();
    runtime.destroy();
    runtime.destroy();
    expect(windowRef.cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(gl.deleteBuffer).toHaveBeenCalledOnce();
    expect(gl.deleteProgram).toHaveBeenCalledOnce();
    expect(lifecycle.destroy).toHaveBeenCalledOnce();
  });

  it('reports unavailable WebGL2 explicitly and never creates the module', () => {
    const onError = vi.fn();
    const module = makeModule({ update: vi.fn(), resize: vi.fn(), setQuality: vi.fn(), setReducedMotion: vi.fn(), destroy: vi.fn() });
    const runtime = new WebGLRuntime({ ...runtimeOptions(makeCanvas(null), module, makeWindow()), onError });
    runtime.start();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(WebGL2UnavailableError);
    expect(module.create).not.toHaveBeenCalled();
  });

  it('distinguishes shader compilation and program link failures', () => {
    const compileFailure = makeGl({ getShaderParameter: vi.fn(() => false), getShaderInfoLog: vi.fn(() => 'bad shader') });
    expect(() => compileWebGLProgram(compileFailure, { vertex: 'vertex', fragment: 'fragment' })).toThrowError(WebGLShaderCompileError);
    const linkFailure = makeGl({ getProgramParameter: vi.fn(() => false), getProgramInfoLog: vi.fn(() => 'bad link') });
    expect(() => compileWebGLProgram(linkFailure, { vertex: 'vertex', fragment: 'fragment' })).toThrowError(WebGLProgramLinkError);
  });

  it('handles context loss explicitly, cleans GPU resources, and cancels the pending RAF', () => {
    const gl = makeGl();
    const windowRef = makeWindow();
    const onError = vi.fn();
    const lifecycle: ModuleLifecycle<any> = { update: vi.fn(), resize: vi.fn(), setQuality: vi.fn(), setReducedMotion: vi.fn(), destroy: vi.fn() };
    const canvas = makeCanvas(gl);
    const runtime = new WebGLRuntime({ ...runtimeOptions(canvas, makeModule(lifecycle), windowRef), onError });
    runtime.start();
    const contextLost = vi.mocked(canvas.addEventListener).mock.calls.find(([type]) => type === 'webglcontextlost')?.[1];
    const event = { preventDefault: vi.fn() } as unknown as Event;
    (contextLost as EventListener)(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(WebGLContextLostError);
    expect(windowRef.cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(gl.deleteBuffer).toHaveBeenCalledOnce();
    expect(gl.deleteProgram).toHaveBeenCalledOnce();
    expect(lifecycle.destroy).toHaveBeenCalledOnce();
  });
});
