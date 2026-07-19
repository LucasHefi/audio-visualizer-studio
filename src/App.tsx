import { useEffect, useMemo, useReducer, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { AudioEngine, isSupportedAudioFile } from './audio/AudioEngine';
import { formatTime } from './core/audioMath';
import { CANVAS_PROFILES, PALETTE_LIST, PALETTES, PROFILE_GROUPS } from './core/catalog';
import { useProjectStore } from './core/projectStore';
import { CanvasRuntime } from './visualizer/CanvasRuntime';
import { AVAILABLE_SCENE_LIST, SCENE_REGISTRY } from './visualizer/sceneModules';
import type { AudioFrame, AudioState, Palette, SceneId, SceneSettings } from './types';
import { INITIAL_OVERLAY_STATE, reduceOverlayState, type OverlayPanelId } from './ui/overlayState';
import './styles.css';

const INITIAL_AUDIO_STATE: AudioState = {
  status: 'empty', name: '', duration: 0, currentTime: 0, volume: 0.8,
};

const sceneIcon: Record<SceneId, string> = {
  spectrum: '▥', waveform: '∿', orbital: '◉', 'fluid-glow': '✦',
};

const OVERLAY_ACTIONS: Array<{ id: OverlayPanelId; label: string; icon: string; hint: string }> = [
  { id: 'visual', label: 'Visual', icon: '✦', hint: 'Scene modules' },
  { id: 'style', label: 'Style', icon: '◌', hint: 'Palette and mood' },
  { id: 'audio', label: 'Audio', icon: '♪', hint: 'Local MP3 source' },
  { id: 'layout', label: 'Layout', icon: '▦', hint: 'Canvas profile' },
  { id: 'import-export', label: 'Import / export', icon: '↥', hint: 'Project interchange' },
  { id: 'presentation', label: 'Present', icon: '⛶', hint: 'Clean capture mode' },
];

function VisualizerCanvas({ engine, palette, settings, sceneId, seed, profileId, profileRatio }: {
  engine: AudioEngine;
  palette: Palette;
  settings: SceneSettings;
  sceneId: SceneId;
  seed: number;
  profileId: string;
  profileRatio: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef(sceneId);
  const paletteRef = useRef(palette);
  const settingsRef = useRef(settings);
  const seedRef = useRef(seed);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  sceneRef.current = sceneId;
  paletteRef.current = palette;
  settingsRef.current = settings;
  seedRef.current = seed;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const runtime = new CanvasRuntime({
      canvas,
      registry: SCENE_REGISTRY,
      getFrame: () => engine.getFrame(),
      getSceneId: () => sceneRef.current,
      getSettings: () => settingsRef.current,
      getPalette: () => paletteRef.current,
      getSeed: () => seedRef.current,
      onError: (error) => setRuntimeError(error.message),
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
    <div className="canvas-frame" data-profile-id={profileId} style={{ aspectRatio: profileRatio }}>
      <canvas ref={canvasRef} aria-label="Live audio visualizer preview" />
      {runtimeError && <div className="preview-runtime-error" role="alert">Preview unavailable: {runtimeError}</div>}
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
  const [overlayState, dispatchOverlay] = useReducer(reduceOverlayState, INITIAL_OVERLAY_STATE);
  const engineRef = useRef<AudioEngine | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const overlayPanelRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
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
  const activeModule = useMemo(() => SCENE_REGISTRY.require(activeSceneId), [activeSceneId]);

  useEffect(() => () => engine.dispose(), [engine]);

  useEffect(() => {
    const timer = window.setInterval(() => setAudioState(engine.getState()), 250);
    return () => window.clearInterval(timer);
  }, [engine]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      dispatchOverlay({ type: 'escape' });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!overlayState.activePanel || overlayState.mode === 'presentation') return undefined;
    previousFocusRef.current = previousFocusRef.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const panel = overlayPanelRef.current;
    if (!panel) return undefined;
    const getFocusable = () => Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]'));
    getFocusable()[0]?.focus();
    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    panel.addEventListener('keydown', handleTab);
    return () => {
      panel.removeEventListener('keydown', handleTab);
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [overlayState.activePanel, overlayState.mode]);

  useEffect(() => {
    if (!overlayState.activePanel || overlayState.mode === 'presentation') return undefined;
    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (overlayPanelRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('.overlay-dock')) return;
      dispatchOverlay({ type: 'close-panel' });
    };
    document.addEventListener('pointerdown', handleOutsidePointer);
    return () => document.removeEventListener('pointerdown', handleOutsidePointer);
  }, [overlayState.activePanel, overlayState.mode]);

  useEffect(() => {
    if (!overlayState.autoHideEnabled || overlayState.mode !== 'edit' || overlayState.activePanel || !overlayState.controlsVisible) return undefined;
    const timer = window.setTimeout(() => dispatchOverlay({ type: 'hide-controls' }), 4500);
    return () => window.clearTimeout(timer);
  }, [overlayState.activePanel, overlayState.autoHideEnabled, overlayState.controlsVisible, overlayState.mode]);

  useEffect(() => {
    if (overlayState.controlsVisible) return undefined;
    const reveal = () => dispatchOverlay({ type: 'reveal-controls' });
    window.addEventListener('pointermove', reveal, { passive: true });
    window.addEventListener('keydown', reveal);
    return () => {
      window.removeEventListener('pointermove', reveal);
      window.removeEventListener('keydown', reveal);
    };
  }, [overlayState.controlsVisible]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && overlayState.mode === 'presentation') {
        dispatchOverlay({ type: 'exit-presentation' });
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [overlayState.mode]);

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
  const handleToggleFullscreen = async () => {
    if (overlayState.mode === 'presentation') {
      dispatchOverlay({ type: 'exit-presentation' });
      if (document.fullscreenElement) await document.exitFullscreen?.();
      return;
    }
    dispatchOverlay({ type: 'enter-presentation' });
    if (document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        // CSS presentation mode remains available when the browser denies Fullscreen API.
      }
    }
  };
  const handlePresentationPointerDown = () => {
    if (overlayState.mode === 'presentation' && !overlayState.controlsVisible) {
      dispatchOverlay({ type: 'reveal-controls' });
    }
  };
  const activeOverlayAction = OVERLAY_ACTIONS.find((action) => action.id === overlayState.activePanel);
  const openOverlayPanel = (panel: OverlayPanelId, trigger?: HTMLElement) => {
    previousFocusRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    dispatchOverlay({ type: 'toggle-panel', panel });
  };
  const renderOverlayPanel = () => {
    if (!activeOverlayAction || overlayState.mode === 'presentation') return null;
    return (
      <section ref={overlayPanelRef} className="overlay-panel" role="dialog" aria-label={`${activeOverlayAction.label} settings`}>
        <div className="overlay-panel-header">
          <div><span className="eyebrow">Quick controls</span><h2>{activeOverlayAction.label}</h2></div>
          <button className="icon-button" type="button" aria-label={`Close ${activeOverlayAction.label} settings`} onClick={() => dispatchOverlay({ type: 'close-panel' })}>×</button>
        </div>
        {overlayState.activePanel === 'visual' && <div className="overlay-panel-stack"><div className="overlay-option-list">{AVAILABLE_SCENE_LIST.map((scene) => <button key={scene.manifest.id} type="button" className={`overlay-option ${activeSceneId === scene.manifest.id ? 'active' : ''}`} onClick={() => setScene(scene.manifest.id)} aria-pressed={activeSceneId === scene.manifest.id}><span className="overlay-option-icon" aria-hidden="true">{sceneIcon[scene.manifest.id]}</span><span><strong>{scene.manifest.name}</strong><small>{scene.manifest.description}</small></span>{activeSceneId === scene.manifest.id && <b aria-hidden="true">✓</b>}</button>)}</div><div className="overlay-inspector"><SectionLabel action="Live">Response</SectionLabel><Slider label="Energy" value={activeSettings.energy} onChange={updateSetting('energy')} hint="Overall visual lift" /><Slider label="Sensitivity" value={activeSettings.sensitivity} onChange={updateSetting('sensitivity')} hint="Audio response curve" /><Slider label="Motion" value={activeSettings.motion} onChange={updateSetting('motion')} hint="Animation tempo" /><Slider label="Density" value={activeSettings.density} onChange={updateSetting('density')} hint="Detail and particles" /><Slider label="Glow" value={activeSettings.glow} onChange={updateSetting('glow')} hint="Bloom intensity" /><button className="text-button" type="button" onClick={resetScene}>Reset scene</button></div></div>}
        {overlayState.activePanel === 'style' && <div className="overlay-option-list">{PALETTE_LIST.map((item) => <button key={item.id} type="button" className={`overlay-option ${paletteId === item.id ? 'active' : ''}`} onClick={() => setPalette(item.id)} aria-pressed={paletteId === item.id}><span className="palette-swatch" style={{ background: `linear-gradient(135deg, ${item.primary}, ${item.secondary}, ${item.accent})` }} /><span><strong>{item.name}</strong><small>{item.description}</small></span>{paletteId === item.id && <b aria-hidden="true">✓</b>}</button>)}</div>}
        {overlayState.activePanel === 'audio' && <div className="overlay-panel-stack"><label className="project-name-field">Project name<input value={projectName} onChange={(event) => setProjectName(event.target.value)} /></label><p className="overlay-copy">{audioState.name ? `${audioState.name} · ${formatTime(audioState.duration)}` : 'No audio selected. The preview is running in silence.'}</p><button className="secondary-button full-width" type="button" onClick={() => fileInputRef.current?.click()}>Choose local MP3</button><span className="overlay-hint">Audio stays in the browser and is never uploaded.</span></div>}
        {overlayState.activePanel === 'layout' && <div className="overlay-panel-stack layout-panel"><p className="overlay-copy">Choose a platform canvas for the live workspace. Export stays disabled; audio and rendering continue.</p><div className="profile-groups">{PROFILE_GROUPS.map((group) => <section className="profile-group" key={group.platform}><h3>{group.platform}</h3><div className="overlay-option-list">{group.profiles.map((item) => <button key={item.id} data-profile-id={item.id} type="button" className={`overlay-option ${profileId === item.id ? 'active' : ''}`} onClick={() => setProfile(item.id)} aria-pressed={profileId === item.id}><span className="overlay-option-icon" aria-hidden="true">{item.orientation === 'portrait' ? '↕' : item.orientation === 'square' ? '□' : '↔'}</span><span><strong>{item.name}</strong><small>{item.orientationLabel} · {item.ratioLabel} · {item.resolution}</small></span>{profileId === item.id && <b aria-hidden="true">✓</b>}</button>)}</div></section>)}</div><p className="profile-selection" aria-live="polite">Active: <strong>{profile.name}</strong> · {profile.ratioLabel} · {profile.resolution}</p></div>}
        {overlayState.activePanel === 'import-export' && <div className="overlay-panel-stack"><p className="overlay-copy">Project interchange is reserved for the next release. No export action is exposed until it has a verified file format and download path.</p><button className="secondary-button full-width" type="button" disabled>Import / export coming next</button></div>}
        {overlayState.activePanel === 'presentation' && <div className="overlay-panel-stack"><p className="overlay-copy">Hide the chrome and expand the live canvas for OBS, screen recording or a clean presentation.</p><button className="primary-button full-width" type="button" onClick={() => void handleToggleFullscreen()}>Enter presentation mode</button><span className="overlay-hint">Press Escape to close this panel or leave presentation mode.</span></div>}
      </section>
    );
  };

  return (
    <main className="studio-shell workspace-shell" data-overlay-mode={overlayState.mode} data-controls-visible={overlayState.controlsVisible}>
      <header className="topbar shell-chrome">
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
        </div>
      </header>

      <div className="workspace visualizer-workspace">
        <section className="stage" aria-label="Visualizer stage" onPointerDown={handlePresentationPointerDown} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
          <input ref={fileInputRef} id="audio-file" className="visually-hidden" type="file" accept="audio/mpeg,.mp3" aria-label="Audio file" onChange={handleFileChange} />
          <nav className="overlay-dock" aria-label="Visualizer quick controls">
            {OVERLAY_ACTIONS.map((action) => <button key={action.id} className={`overlay-dock-button ${overlayState.activePanel === action.id ? 'active' : ''}`} type="button" aria-label={action.label} aria-pressed={overlayState.activePanel === action.id} title={`${action.label} — ${action.hint}`} onClick={(event) => action.id === 'presentation' ? void handleToggleFullscreen() : openOverlayPanel(action.id, event.currentTarget)}><span className="dock-icon" aria-hidden="true">{action.icon}</span><span className="dock-label">{action.label}</span></button>)}
          </nav>
          {renderOverlayPanel()}
          <div className="stage-toolbar shell-chrome">
            <div className="stage-breadcrumb"><span className="scene-badge">{sceneIcon[activeSceneId]}</span><div><strong>{activeModule.manifest.name}</strong><small>{activeModule.manifest.tags.join(' · ')}</small></div></div>
            <span className="frame-badge">60 FPS target</span>
          </div>
          <div className="preview-shell">
            <VisualizerCanvas engine={engine} palette={palette} settings={activeSettings} sceneId={activeSceneId} seed={useProjectStore.getState().seed} profileId={profile.id} profileRatio={profile.ratio} />
            {!audioState.name && <div className="preview-empty"><div className="empty-orbit" aria-hidden="true">◌</div><strong>Load an MP3 to make the scene react</strong><span>The preview is already running in silence.</span></div>}
            <div className="presentation-reveal" aria-live="polite"><button className="presentation-reveal-button" type="button" aria-label="Show presentation controls" onClick={() => dispatchOverlay({ type: 'reveal-controls' })}>Show controls</button></div>
            {overlayState.mode === 'presentation' && overlayState.controlsVisible && <div className="presentation-controls" role="status"><span>Presentation mode</span><button className="presentation-exit-button" type="button" onClick={() => void handleToggleFullscreen()}>Exit presentation mode</button></div>}
            <div className="preview-corner top-left"><span className="corner-dot" /> {profile.platform} · {profile.name} · {profile.ratioLabel} · {profile.resolution}</div>
            <div className="preview-corner bottom-right">module v1.0 · {palette.name}</div>
          </div>
          <footer className="transport floating-transport" aria-label="Audio transport">
            <div className="track-meta"><div className="track-art" aria-hidden="true">{audioState.name ? '♪' : '∅'}</div><div><strong>{audioState.name || 'No audio selected'}</strong><span>{audioState.name ? 'Local audio source' : 'Choose an MP3 to begin'}</span></div></div>
            <div className="transport-center"><div className="transport-controls"><button type="button" className="transport-button" aria-label="Previous position" onClick={() => engine.seek(Math.max(0, audioState.currentTime - 10))}>↶</button><button type="button" className="play-button" aria-label={isPlaying ? 'Pause audio' : 'Play audio'} onClick={() => void handleTogglePlayback()} disabled={!audioState.name}>{isPlaying ? 'Ⅱ' : '▶'}</button><button type="button" className="transport-button" aria-label="Next position" onClick={() => engine.seek(Math.min(audioState.duration, audioState.currentTime + 10))}>↷</button></div><div className="timeline"><span>{formatTime(audioState.currentTime)}</span><input aria-label="Playback position" type="range" min="0" max={audioState.duration || 1} step="0.1" value={Math.min(audioState.currentTime, audioState.duration || 1)} style={{ '--progress': `${progress}%` } as React.CSSProperties} onChange={(event) => engine.seek(Number(event.target.value))} /><span>{formatTime(audioState.duration)}</span></div></div>
            <div className="volume-control"><span aria-hidden="true">◖</span><input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={audioState.volume} onChange={(event) => engine.setVolume(Number(event.target.value))} /></div>
          </footer>
          <div className="stage-note shell-chrome"><span className="note-icon">i</span><span>Audio stays in your browser. Project controls persist locally; no upload or account is required.</span></div>
        </section>
      </div>
    </main>
  );
}

export default App;
