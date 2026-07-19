import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { AudioEngine, isSupportedAudioFile } from './audio/AudioEngine';
import { formatTime } from './core/audioMath';
import { CANVAS_PROFILES, PALETTE_LIST, PALETTES, PROFILE_LIST } from './core/catalog';
import { useProjectStore } from './core/projectStore';
import { CanvasRuntime } from './visualizer/CanvasRuntime';
import { SCENE_LIST } from './visualizer/sceneModules';
import type { AudioFrame, AudioState, Palette, SceneId, SceneSettings } from './types';
import './styles.css';

const INITIAL_AUDIO_STATE: AudioState = {
  status: 'empty', name: '', duration: 0, currentTime: 0, volume: 0.8,
};

const sceneIcon: Record<SceneId, string> = {
  spectrum: '▥', waveform: '∿', orbital: '◉', 'fluid-glow': '✦',
};

function VisualizerCanvas({ engine, palette, settings, sceneId, seed, profileRatio }: {
  engine: AudioEngine;
  palette: Palette;
  settings: SceneSettings;
  sceneId: SceneId;
  seed: number;
  profileRatio: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef(sceneId);
  const paletteRef = useRef(palette);
  const settingsRef = useRef(settings);
  const seedRef = useRef(seed);
  sceneRef.current = sceneId;
  paletteRef.current = palette;
  settingsRef.current = settings;
  seedRef.current = seed;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const runtime = new CanvasRuntime({
      canvas,
      getFrame: () => engine.getFrame(),
      getSceneId: () => sceneRef.current,
      getSettings: () => settingsRef.current,
      getPalette: () => paletteRef.current,
      getSeed: () => seedRef.current,
    });
    runtime.start();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => runtime.resize());
    observer?.observe(canvas);
    return () => {
      observer?.disconnect();
      runtime.destroy();
    };
  }, [engine]);

  return (
    <div className="canvas-frame" style={{ aspectRatio: profileRatio }}>
      <canvas ref={canvasRef} aria-label="Live audio visualizer preview" />
    </div>
  );
}

function SectionLabel({ children, action }: { children: string; action?: string }) {
  return <div className="section-label"><span>{children}</span>{action && <span className="section-action">{action}</span>}</div>;
}

function Slider({ label, value, onChange, hint }: { label: string; value: number; onChange: (value: number) => void; hint: string }) {
  return (
    <label className="slider-row">
      <span className="slider-heading"><span>{label}</span><output>{Math.round(value * 100)}%</output></span>
      <input aria-label={label} type="range" min="0" max="1" step="0.01" value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <span className="slider-hint">{hint}</span>
    </label>
  );
}

function App() {
  const [audioState, setAudioState] = useState<AudioState>(INITIAL_AUDIO_STATE);
  const engineRef = useRef<AudioEngine | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  if (!engineRef.current) engineRef.current = new AudioEngine(setAudioState);
  const engine = engineRef.current;

  const projectName = useProjectStore((state) => state.projectName);
  const activeSceneId = useProjectStore((state) => state.activeSceneId);
  const sceneSettings = useProjectStore((state) => state.sceneSettings);
  const paletteId = useProjectStore((state) => state.paletteId);
  const profileId = useProjectStore((state) => state.profileId);
  const setScene = useProjectStore((state) => state.setScene);
  const setSceneSetting = useProjectStore((state) => state.setSceneSetting);
  const resetScene = useProjectStore((state) => state.resetScene);
  const setPalette = useProjectStore((state) => state.setPalette);
  const setProfile = useProjectStore((state) => state.setProfile);
  const setProjectName = useProjectStore((state) => state.setProjectName);

  const palette = PALETTES[paletteId];
  const profile = CANVAS_PROFILES[profileId];
  const activeSettings = sceneSettings[activeSceneId];
  const activeModule = useMemo(() => SCENE_LIST.find((scene) => scene.manifest.id === activeSceneId) ?? SCENE_LIST[0], [activeSceneId]);

  useEffect(() => () => engine.dispose(), [engine]);

  useEffect(() => {
    const timer = window.setInterval(() => setAudioState(engine.getState()), 250);
    return () => window.clearInterval(timer);
  }, [engine]);

  const loadFile = async (file: File) => {
    if (!isSupportedAudioFile(file)) {
      setAudioState({ ...engine.getState(), status: 'error', error: 'Only MP3 files are supported in this MVP.' });
      return;
    }
    try {
      await engine.load(file);
    } catch (error) {
      setAudioState({ ...engine.getState(), status: 'error', error: error instanceof Error ? error.message : 'Could not load the audio file.' });
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void loadFile(file);
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void loadFile(file);
  };

  const handleTogglePlayback = async () => {
    try {
      await engine.togglePlayback();
    } catch (error) {
      setAudioState({ ...engine.getState(), status: 'error', error: error instanceof Error ? error.message : 'Playback could not start.' });
    }
  };

  const updateSetting = (key: keyof SceneSettings) => (value: number) => setSceneSetting(key, value);
  const isPlaying = audioState.status === 'playing';
  const progress = audioState.duration > 0 ? (audioState.currentTime / audioState.duration) * 100 : 0;

  return (
    <main className="studio-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span>AV</span><i /></div>
          <div>
            <h1>Audio Visualizer Studio</h1>
            <p>Browser-native motion lab</p>
          </div>
        </div>
        <div className="topbar-center"><span className="live-dot" /> Preview is live</div>
        <div className="topbar-actions">
          <span className="status-pill"><span className="status-dot" /> Local-first</span>
          <span className="export-pill">Export seam · coming next</span>
          <button className="icon-button" aria-label="Open project menu" title="Open project menu">•••</button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar left-sidebar">
          <div className="panel-heading">
            <div><span className="eyebrow">Project</span><h2>Canvas setup</h2></div>
            <span className="save-state">Saved locally</span>
          </div>
          <label className="project-name-field">Project name<input value={projectName} onChange={(event) => setProjectName(event.target.value)} /></label>

          <SectionLabel action="MP3 only">Audio source</SectionLabel>
          <div className="dropzone" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
            <div className="dropzone-icon" aria-hidden="true">↥</div>
            <strong>{audioState.name || 'Drop an MP3 here'}</strong>
            <span>{audioState.name ? `${formatTime(audioState.duration)} · ready to preview` : 'or choose a local file'}</span>
            <input ref={fileInputRef} id="audio-file" className="visually-hidden" type="file" accept="audio/mpeg,.mp3" aria-label="Audio file" onChange={handleFileChange} />
            <button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()}>Choose file</button>
          </div>
          {audioState.error && <p className="error-text" role="alert">{audioState.error}</p>}

          <SectionLabel>Scene modules</SectionLabel>
          <div className="scene-list">
            {SCENE_LIST.map((scene) => (
              <button key={scene.manifest.id} type="button" className={`scene-card ${activeSceneId === scene.manifest.id ? 'active' : ''}`} onClick={() => setScene(scene.manifest.id)} aria-pressed={activeSceneId === scene.manifest.id}>
                <span className="scene-icon" aria-hidden="true">{sceneIcon[scene.manifest.id]}</span>
                <span className="scene-card-copy"><strong>{scene.manifest.name}</strong><small>{scene.manifest.description}</small></span>
                {activeSceneId === scene.manifest.id && <span className="selected-mark" aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>
        </aside>

        <section className="stage" aria-label="Visualizer stage">
          <div className="stage-toolbar">
            <div className="stage-breadcrumb"><span className="scene-badge">{sceneIcon[activeSceneId]}</span><div><strong>{activeModule.manifest.name}</strong><small>{activeModule.manifest.tags.join(' · ')}</small></div></div>
            <div className="stage-toolbar-actions"><span className="frame-badge">60 FPS target</span><button className="icon-button" aria-label="Toggle fullscreen" title="Toggle fullscreen" onClick={() => document.documentElement.requestFullscreen?.()}>⛶</button></div>
          </div>
          <div className="preview-shell">
            <VisualizerCanvas engine={engine} palette={palette} settings={activeSettings} sceneId={activeSceneId} seed={useProjectStore.getState().seed} profileRatio={profile.ratio} />
            {!audioState.name && <div className="preview-empty"><div className="empty-orbit" aria-hidden="true">◌</div><strong>Load an MP3 to make the scene react</strong><span>The preview is already running in silence.</span></div>}
            <div className="preview-corner top-left"><span className="corner-dot" /> {profile.name} · {profile.resolution}</div>
            <div className="preview-corner bottom-right">module v1.0 · {palette.name}</div>
          </div>
          <div className="stage-note"><span className="note-icon">i</span><span>Audio stays in your browser. Project controls persist locally; no upload or account is required.</span></div>
        </section>

        <aside className="sidebar right-sidebar">
          <div className="panel-heading"><div><span className="eyebrow">Inspector</span><h2>Scene controls</h2></div><button className="reset-button" type="button" onClick={resetScene}>Reset</button></div>
          <div className="inspector-group"><SectionLabel>Canvas profile</SectionLabel><div className="profile-grid">{PROFILE_LIST.map((item) => <button key={item.id} type="button" className={`profile-button ${profileId === item.id ? 'active' : ''}`} onClick={() => setProfile(item.id)} aria-pressed={profileId === item.id}><span>{item.name}</span><small>{item.resolution}</small></button>)}</div></div>
          <div className="inspector-group"><SectionLabel>Palette</SectionLabel><div className="palette-list">{PALETTE_LIST.map((item) => <button key={item.id} type="button" className={`palette-button ${paletteId === item.id ? 'active' : ''}`} onClick={() => setPalette(item.id)} aria-pressed={paletteId === item.id}><span className="palette-swatch" style={{ background: `linear-gradient(135deg, ${item.primary}, ${item.secondary}, ${item.accent})` }} /><span><strong>{item.name}</strong><small>{item.description}</small></span>{paletteId === item.id && <b>✓</b>}</button>)}</div></div>
          <div className="inspector-group slider-group"><SectionLabel>Response</SectionLabel><Slider label="Energy" value={activeSettings.energy} onChange={updateSetting('energy')} hint="Overall visual lift" /><Slider label="Sensitivity" value={activeSettings.sensitivity} onChange={updateSetting('sensitivity')} hint="Audio response curve" /><Slider label="Motion" value={activeSettings.motion} onChange={updateSetting('motion')} hint="Animation tempo" /><Slider label="Density" value={activeSettings.density} onChange={updateSetting('density')} hint="Detail and particles" /><Slider label="Glow" value={activeSettings.glow} onChange={updateSetting('glow')} hint="Bloom intensity" /></div>
        </aside>
      </div>

      <footer className="transport">
        <div className="track-meta"><div className="track-art" aria-hidden="true">{audioState.name ? '♪' : '∅'}</div><div><strong>{audioState.name || 'No audio selected'}</strong><span>{audioState.name ? 'Local audio source' : 'Choose an MP3 to begin'}</span></div></div>
        <div className="transport-center"><div className="transport-controls"><button type="button" className="transport-button" aria-label="Previous position" onClick={() => engine.seek(Math.max(0, audioState.currentTime - 10))}>↶</button><button type="button" className="play-button" aria-label={isPlaying ? 'Pause audio' : 'Play audio'} onClick={() => void handleTogglePlayback()} disabled={!audioState.name}>{isPlaying ? 'Ⅱ' : '▶'}</button><button type="button" className="transport-button" aria-label="Next position" onClick={() => engine.seek(Math.min(audioState.duration, audioState.currentTime + 10))}>↷</button></div><div className="timeline"><span>{formatTime(audioState.currentTime)}</span><input aria-label="Playback position" type="range" min="0" max={audioState.duration || 1} step="0.1" value={Math.min(audioState.currentTime, audioState.duration || 1)} style={{ '--progress': `${progress}%` } as React.CSSProperties} onChange={(event) => engine.seek(Number(event.target.value))} /><span>{formatTime(audioState.duration)}</span></div></div>
        <div className="volume-control"><span aria-hidden="true">◖</span><input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={audioState.volume} onChange={(event) => engine.setVolume(Number(event.target.value))} /></div>
      </footer>
    </main>
  );
}

export default App;
