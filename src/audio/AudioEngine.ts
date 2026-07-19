import { calculateBeatPulse, calculateEnergyBands, clamp, createSilentFrame } from '../core/audioMath';
import type { AudioFrame, AudioState } from '../types';

type AudioStateListener = (state: AudioState) => void;

type BrowserAudioContext = typeof AudioContext & { new (): AudioContext };

export const isSupportedAudioFile = (file: File): boolean => {
  const extension = file.name.toLowerCase().split('.').pop();
  return file.type === 'audio/mpeg' || file.type === 'audio/mp3' || extension === 'mp3';
};

export class AudioEngine {
  private readonly audio: HTMLAudioElement;
  private readonly notify: AudioStateListener;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private objectUrl: string | null = null;
  private frequencyData = new Uint8Array(256);
  private waveformData = new Uint8Array(256).fill(128);
  private previousVolume = 0;
  private state: AudioState = {
    status: 'empty',
    name: '',
    duration: 0,
    currentTime: 0,
    volume: 0.8,
  };

  public constructor(notify: AudioStateListener) {
    this.notify = notify;
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.audio.addEventListener('loadedmetadata', this.handleMetadata);
    this.audio.addEventListener('timeupdate', this.handleTimeUpdate);
    this.audio.addEventListener('play', this.handlePlay);
    this.audio.addEventListener('pause', this.handlePause);
    this.audio.addEventListener('ended', this.handleEnded);
    this.audio.addEventListener('error', this.handleError);
  }

  public getState(): AudioState {
    return { ...this.state };
  }

  public async load(file: File): Promise<void> {
    if (!isSupportedAudioFile(file)) throw new Error('Please choose an MP3 audio file.');
    this.setState({ status: 'loading', name: file.name, error: undefined });
    this.audio.pause();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file);
    this.audio.src = this.objectUrl;
    this.audio.currentTime = 0;
    this.audio.load();
    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(new Error('The browser could not decode this MP3 file.')); };
      const cleanup = () => {
        this.audio.removeEventListener('loadedmetadata', onLoaded);
        this.audio.removeEventListener('error', onError);
      };
      this.audio.addEventListener('loadedmetadata', onLoaded, { once: true });
      this.audio.addEventListener('error', onError, { once: true });
    });
    this.setState({ status: 'ready', duration: Number.isFinite(this.audio.duration) ? this.audio.duration : 0, currentTime: 0 });
  }

  public async togglePlayback(): Promise<void> {
    if (!this.audio.src) return;
    if (this.audio.paused) {
      await this.ensureGraph();
      await this.audioContext?.resume();
      await this.audio.play();
    } else {
      this.audio.pause();
    }
  }

  public seek(seconds: number): void {
    if (!Number.isFinite(seconds)) return;
    this.audio.currentTime = clamp(seconds, 0, this.state.duration || Number.MAX_SAFE_INTEGER);
    this.setState({ currentTime: this.audio.currentTime });
  }

  public setVolume(volume: number): void {
    this.audio.volume = clamp(volume);
    this.setState({ volume: this.audio.volume });
  }

  public getFrame(): AudioFrame {
    if (!this.analyser) return createSilentFrame(128);
    this.analyser.getByteFrequencyData(this.frequencyData);
    this.analyser.getByteTimeDomainData(this.waveformData);
    const bands = calculateEnergyBands(this.frequencyData);
    let total = 0;
    for (let index = 0; index < this.waveformData.length; index += 1) {
      total += Math.abs((this.waveformData[index] ?? 128) - 128) / 128;
    }
    const volume = clamp(total / this.waveformData.length);
    const beatPulse = calculateBeatPulse(volume, this.previousVolume);
    this.previousVolume = volume;
    return { ...bands, frequencyBins: this.frequencyData, waveform: this.waveformData, volume, beatPulse };
  }

  public dispose(): void {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.audioContext?.close().catch(() => undefined);
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.objectUrl = null;
  }

  private async ensureGraph(): Promise<void> {
    if (this.analyser) return;
    const AudioContextConstructor = (window.AudioContext ?? (window as Window & { webkitAudioContext?: BrowserAudioContext }).webkitAudioContext) as BrowserAudioContext | undefined;
    if (!AudioContextConstructor) throw new Error('Web Audio API is not available in this browser.');
    this.audioContext = new AudioContextConstructor();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.78;
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    this.waveformData = new Uint8Array(this.analyser.fftSize);
    this.source = this.audioContext.createMediaElementSource(this.audio);
    this.source.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);
  }

  private setState(patch: Partial<AudioState>): void {
    this.state = { ...this.state, ...patch };
    this.notify(this.getState());
  }

  private readonly handleMetadata = () => {
    this.setState({ duration: Number.isFinite(this.audio.duration) ? this.audio.duration : 0 });
  };

  private readonly handleTimeUpdate = () => {
    this.setState({ currentTime: this.audio.currentTime });
  };

  private readonly handlePlay = () => this.setState({ status: 'playing' });
  private readonly handlePause = () => this.setState({ status: this.audio.currentTime > 0 ? 'paused' : 'ready' });
  private readonly handleEnded = () => this.setState({ status: 'ready', currentTime: 0 });
  private readonly handleError = () => this.setState({ status: 'error', error: 'Audio playback failed in the browser.' });
}
