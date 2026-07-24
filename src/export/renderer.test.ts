import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioFrame, Canvas2DSceneModule, SceneSettings } from '../types';
import { PALETTES } from '../core/catalog';
import { DeterministicExportRenderer } from './renderer';

const settings: SceneSettings = { energy: 0.5, sensitivity: 0.5, motion: 0.5, density: 0.5, glow: 0.5, background: 0.5 };
const frame: AudioFrame = { frequencyBins: [], waveform: [], bassEnergy: 0, midEnergy: 0, trebleEnergy: 0, volume: 0, beatPulse: 0 };

class FakeContext {
  public readonly drawImage = vi.fn();
  public readonly clearRect = vi.fn();
  public readonly save = vi.fn();
  public readonly restore = vi.fn();
  public readonly compositeModes: string[] = [];
  public readonly alphaValues: number[] = [];
  public fillStyle = '';
  private compositeMode = 'source-over';
  private alpha = 1;

  public set globalCompositeOperation(value: string) {
    this.compositeMode = value;
    this.compositeModes.push(value);
  }

  public get globalCompositeOperation(): string { return this.compositeMode; }

  public set globalAlpha(value: number) {
    this.alpha = value;
    this.alphaValues.push(value);
  }

  public get globalAlpha(): number { return this.alpha; }
}

class FakeCanvas {
  public width: number;
  public height: number;
  public readonly context = new FakeContext();

  public constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  public getContext(kind: string): FakeContext | null {
    return kind === '2d' ? this.context : null;
  }
}

const makeModule = (sceneId: 'spectrum' | 'waveform', render: ReturnType<typeof vi.fn>): Canvas2DSceneModule => ({
  manifest: {
    id: sceneId,
    kind: 'visualizer',
    apiVersion: 1,
    backend: 'canvas2d',
    version: 'test',
    name: sceneId,
    description: 'test',
    tags: [],
    capabilities: ['audio-frame', 'canvas', 'settings'],
    entitlement: 'core',
    settingsSchema: { version: 1, fields: {} },
  },
  defaults: settings,
  render,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('deterministic multi-layer export renderer', () => {
  it('renders every layer and composites them in preview order', () => {
    const layerOneRender = vi.fn();
    const layerTwoRender = vi.fn();
    const moduleOne = makeModule('spectrum', layerOneRender);
    const moduleTwo = makeModule('waveform', layerTwoRender);
    const canvases: FakeCanvas[] = [];
    vi.stubGlobal('OffscreenCanvas', class extends FakeCanvas {
      public constructor(width: number, height: number) {
        super(width, height);
        canvases.push(this);
      }
    });
    vi.stubGlobal('VideoFrame', class {
      public readonly close = vi.fn();
      public constructor(public readonly source: unknown, public readonly options: unknown) {}
    });

    const output = new FakeCanvas(320, 180);
    const renderer = new DeterministicExportRenderer({
      canvas: output as unknown as OffscreenCanvas,
      layers: [
        { id: 'one', module: moduleOne, palette: PALETTES.emerald, settings, seed: 11 },
        { id: 'two', module: moduleTwo, palette: PALETTES.ruby, settings, seed: 22 },
      ],
      width: 320,
      height: 180,
      quality: 'balanced',
      reducedMotion: true,
    });

    const rendered = renderer.render({ timestamp: 0.5, duration: 1 / 30, audioFrame: frame });

    expect(layerOneRender).toHaveBeenCalledOnce();
    expect(layerTwoRender).toHaveBeenCalledOnce();
    expect(layerOneRender.mock.calls[0][5]).toBe(PALETTES.emerald);
    expect(layerTwoRender.mock.calls[0][5]).toBe(PALETTES.ruby);
    expect(output.context.drawImage).toHaveBeenCalledTimes(2);
    expect(output.context.drawImage.mock.calls[0][0]).toBe(canvases[0]);
    expect(output.context.drawImage.mock.calls[1][0]).toBe(canvases[1]);
    expect(output.context.compositeModes).toContain('screen');
    expect(output.context.alphaValues).toContain(0.84);

    rendered.close();
    renderer.destroy();
  });

  it('fails closed when there are no active layers', () => {
    expect(() => new DeterministicExportRenderer({
      canvas: new FakeCanvas(320, 180) as unknown as OffscreenCanvas,
      layers: [],
      width: 320,
      height: 180,
      quality: 'balanced',
      reducedMotion: false,
    })).toThrow('At least one active visual layer is required for export.');
  });
});
