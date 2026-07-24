import { useEffect, useMemo, useReducer, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { AudioEngine, isSupportedAudioFile } from './audio/AudioEngine';
import { formatTime } from './core/audioMath';
import { CANVAS_PROFILES, PALETTE_LIST, PALETTES, PROFILE_GROUPS } from './core/catalog';
import { localizeOrientation, localizePalette, localizeProfileName, localizeProfilePlatform, localizeScene, SUPPORTED_LOCALES, useLocale, type TranslationKey } from './core/i18n';
import { useProjectStore } from './core/projectStore';
import { RendererRuntime } from './visualizer/RendererRuntime';
import { AVAILABLE_SCENE_LIST, SCENE_REGISTRY } from './visualizer/sceneModules';
import { decodeAudioFile } from './export/audioAnalysis';
import { snapshotAudioFile, type StableAudioFile } from './export/audioSource';
import { runWebCodecsMp4ExportInWorker } from './export/workerClient';
import type { ExportProgress } from './export/pipeline';
import { createFrozenExportSnapshot } from './export/snapshot';
import { formatExportError } from './export/errorMessage';
import type { ExportRequest } from './export/types';
import type { AudioFrame, AudioState, Palette, SceneId, SceneSettings, VisualLayer } from './types';
import { INITIAL_OVERLAY_STATE, reduceOverlayState, type OverlayPanelId } from './ui/overlayState';
import './styles.css';

const INITIAL_AUDIO_STATE: AudioState = {
  status: 'empty', name: '', duration: 0, currentTime: 0, volume: 0.8,
};

const sceneIcon: Record<SceneId, string> = {
  spectrum: '▥', '3d-spectrum': '◫', waveform: '∿', orbital: '◉', 'fluid-glow': '✦', 'cosmic-kaleidoscope': '✧', 'layered-circles': '◎',
};

const OVERLAY_ACTIONS: Array<{ id: OverlayPanelId; label: string; icon: string; hint: string }> = [
  { id: 'visual', label: 'Visual', icon: 'visual', hint: 'Scene modules' },
  { id: 'style', label: 'Style', icon: 'style', hint: 'Palette and mood' },
  { id: 'audio', label: 'Audio', icon: 'audio', hint: 'Local MP3 source' },
  { id: 'layout', label: 'Layout', icon: 'layout', hint: 'Canvas profile' },
  { id: 'import-export', label: 'Import / export', icon: 'import-export', hint: 'Project interchange' },
  { id: 'presentation', label: 'Present', icon: 'presentation', hint: 'Clean capture mode' },
];

function DockIcon({ name }: { name: OverlayPanelId }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const shape = {
    visual: <><path {...common} d="M12 3v18M3 12h18M5.5 5.5l13 13M18.5 5.5l-13 13" /><circle {...common} cx="12" cy="12" r="3.1" /></>,
    style: <><circle {...common} cx="9" cy="9" r="4.4" /><circle {...common} cx="15.5" cy="15.5" r="4.4" /><path {...common} d="M17.5 3.5v4M15.5 5.5h4" /></>,
    audio: <><path {...common} d="M9 18V6l10-2v12" /><circle {...common} cx="6.5" cy="18" r="2.5" /><circle {...common} cx="16.5" cy="16" r="2.5" /></>,
    layout: <><rect {...common} x="3.5" y="3.5" width="17" height="17" rx="2" /><path {...common} d="M3.5 9h17M9 9v11.5" /></>,
    'import-export': <><path {...common} d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 20h14" /><path {...common} d="M5 16.5V20M19 16.5V20" /></>,
    presentation: <><path {...common} d="M8 3H4v4M16 3h4v4M8 21H4v-4M16 21h4v-4" /><rect {...common} x="7" y="7" width="10" height="10" rx="1.5" /></>,
  }[name];
  return <svg className="dock-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{shape}</svg>;
}

const OVERLAY_LABEL_KEYS: Record<OverlayPanelId, TranslationKey> = {
  visual: 'visual',
  style: 'style',
  audio: 'audio',
  layout: 'layout',
  'import-export': 'importExport',
  presentation: 'present',
};
const OVERLAY_HINT_KEYS: Record<OverlayPanelId, TranslationKey> = {
  visual: 'sceneModules',
  style: 'paletteMood',
  audio: 'localMp3Source',
  layout: 'canvasProfile',
  'import-export': 'projectInterchange',
  presentation: 'cleanCaptureMode',
};

const LANGUAGE_NAME_KEYS: Record<string, TranslationKey> = {
  en: 'languageEnglish', de: 'languageGerman', fr: 'languageFrench', it: 'languageItalian', es: 'languageSpanish', cs: 'languageCzech', pl: 'languagePolish',
};

function VisualizerCanvas({ engine, palette, settings, sceneId, seed, profileId, profileRatio, ariaLabel, layerId, layerIndex }: {
  engine: AudioEngine;
  palette: Palette;
  settings: SceneSettings;
  sceneId: SceneId;
  seed: number;
  profileId: string;
  profileRatio: number;
  ariaLabel: string;
  layerId: string;
  layerIndex: number;
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
    const runtime = new RendererRuntime({
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
    let pendingResizeHandle = 0;
    const resizeAfterLayout = () => {
      if (pendingResizeHandle) window.cancelAnimationFrame(pendingResizeHandle);
      runtime.resize();
      pendingResizeHandle = window.requestAnimationFrame(() => {
        pendingResizeHandle = 0;
        runtime.resize();
      });
    };
    resizeAfterLayout();
    const handleViewportRestore = () => resizeAfterLayout();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') handleViewportRestore();
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => runtime.resize());
    observer?.observe(canvas.parentElement ?? canvas);
    window.addEventListener('pageshow', handleViewportRestore);
    window.addEventListener('resize', handleViewportRestore, { passive: true });
    window.addEventListener('orientationchange', handleViewportRestore, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      if (pendingResizeHandle) window.cancelAnimationFrame(pendingResizeHandle);
      observer?.disconnect();
      window.removeEventListener('pageshow', handleViewportRestore);
      window.removeEventListener('resize', handleViewportRestore);
      window.removeEventListener('orientationchange', handleViewportRestore);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      runtime.destroy();
    };
  }, [engine, sceneId]);

  return (
    <div className={`canvas-frame layer-canvas-frame layer-index-${layerIndex}`} data-layer-id={layerId} data-profile-id={profileId} style={{ aspectRatio: profileRatio }}>
      <canvas ref={canvasRef} aria-label={`${ariaLabel} — layer ${layerIndex + 1}`} />
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
  const { locale, setLocale, t } = useLocale();
  const [audioState, setAudioState] = useState<AudioState>(INITIAL_AUDIO_STATE);
  const [overlayState, dispatchOverlay] = useReducer(reduceOverlayState, INITIAL_OVERLAY_STATE);
  const [exportFps, setExportFps] = useState(30);
  const [exportDuration, setExportDuration] = useState(30);
  const [exportQuality, setExportQuality] = useState<'high' | 'balanced' | 'low'>('balanced');
  const [exportReducedMotion, setExportReducedMotion] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportBlob, setExportBlob] = useState<Blob | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const engineRef = useRef<AudioEngine | null>(null);
  const audioFileRef = useRef<StableAudioFile | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
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
  const visualLayers = useProjectStore((state) => state.visualLayers);
  const selectedLayerId = useProjectStore((state) => state.selectedLayerId);
  const selectScene = useProjectStore((state) => state.selectScene);
  const toggleScene = useProjectStore((state) => state.toggleScene);
  const setSceneSetting = useProjectStore((state) => state.setSceneSetting);
  const resetScene = useProjectStore((state) => state.resetScene);
  const randomizeScene = useProjectStore((state) => state.randomizeScene);
  const setLayerPalette = useProjectStore((state) => state.setLayerPalette);
  const setProfile = useProjectStore((state) => state.setProfile);
  const setProjectName = useProjectStore((state) => state.setProjectName);

  const selectedLayer: VisualLayer = useMemo(() => visualLayers.find((layer) => layer.id === selectedLayerId) ?? visualLayers[0], [selectedLayerId, visualLayers]);
  const activeLayers = useMemo(() => visualLayers.filter((layer) => layer.enabled), [visualLayers]);
  const palette = PALETTES[paletteId];
  const profile = CANVAS_PROFILES[profileId];
  const activeSettings = selectedLayer?.settings ?? sceneSettings[activeSceneId];
  const activeModule = useMemo(() => SCENE_REGISTRY.require(activeSceneId), [activeSceneId]);
  const activeSceneCopy = localizeScene(locale, activeSceneId);

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
      const stableAudio = await snapshotAudioFile(file);
      await engine.load(file);
      audioFileRef.current = stableAudio;
      setExportDuration(Math.max(1, Math.min(3_600, stableAudio.size > 0 ? Math.min(engine.getState().duration || 30, 3_600) : 30)));
      setExportError(null);
      setExportBlob(null);
    } catch (error) {
      setAudioState({ ...engine.getState(), status: 'error', error: error instanceof Error ? error.message : 'Could not load the audio file.' });
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void loadFile(file);
    event.target.value = '';
  };

  const handleResetAudio = () => {
    if (isExporting) exportAbortRef.current?.abort();
    engine.reset();
    audioFileRef.current = null;
    setExportBlob(null);
    setExportProgress(null);
    setExportError(null);
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

  const handleExport = async () => {
    const file = audioFileRef.current;
    if (!file) {
      setExportError('Nejdřív vyber lokální MP3. Export bez zdrojového audia není povolen.');
      return;
    }
    if (isExporting) return;
    if (activeLayers.length === 0) {
      setExportError('Nejdřív aktivuj alespoň jednu vizualizační vrstvu.');
      return;
    }
    const duration = Math.max(1, Math.min(3_600, Number(exportDuration)));
    const controller = new AbortController();
    exportAbortRef.current = controller;
    setIsExporting(true);
    setExportError(null);
    setExportBlob(null);
    try {
      const analysis = await decodeAudioFile(file.bytes);
      const request: ExportRequest = {
        profileId,
        width: profile.width,
        height: profile.height,
        fps: exportFps,
        duration,
        seed: useProjectStore.getState().seed,
        audio: { name: file.name, size: file.size, lastModified: file.lastModified },
      };
      const exportLayers = activeLayers.map((layer) => ({
        id: layer.id,
        module: SCENE_REGISTRY.require(layer.sceneId),
        palette: PALETTES[layer.paletteId],
        settings: layer.settings,
        seed: layer.seed,
      }));
      const snapshot = createFrozenExportSnapshot({ request, profile, layers: exportLayers, reducedMotion: exportReducedMotion, quality: exportQuality });
      const blob = await runWebCodecsMp4ExportInWorker({ snapshot, audio: analysis, signal: controller.signal, onProgress: setExportProgress });
      setExportBlob(blob);
    } catch (error) {
      const cancelled = error instanceof Error && error.message === 'Export was cancelled.';
      setExportProgress((current: ExportProgress | null) => current ? { ...current, state: cancelled ? 'cancelled' : 'failed', message: cancelled ? 'Export cancelled.' : 'Export failed.' } : null);
      setExportError(cancelled ? null : formatExportError(error));
    } finally {
      exportAbortRef.current = null;
      setIsExporting(false);
    }
  };

  const handleCancelExport = () => exportAbortRef.current?.abort();
  const handleDownloadExport = () => {
    if (!exportBlob) return;
    const url = URL.createObjectURL(exportBlob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${projectName || 'audio-visualizer-export'}.mp4`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
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
  const activeOverlayLabel = activeOverlayAction ? t(OVERLAY_LABEL_KEYS[activeOverlayAction.id]) : '';
  const openOverlayPanel = (panel: OverlayPanelId, trigger?: HTMLElement) => {
    previousFocusRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    dispatchOverlay({ type: 'toggle-panel', panel });
  };
  const renderOverlayPanel = () => {
    if (!activeOverlayAction || overlayState.mode === 'presentation') return null;
    return (
      <section id="visualizer-overlay-panel" ref={overlayPanelRef} className="overlay-panel" role="dialog" aria-label={`${activeOverlayLabel} settings`}>
        <div className="overlay-panel-header">
          <div><span className="eyebrow">{t('quickControls')}</span><h2>{activeOverlayLabel}</h2></div>
          <button className="icon-button" type="button" aria-label={t('closeSettings', { name: activeOverlayLabel })} onClick={() => dispatchOverlay({ type: 'close-panel' })}>×</button>
        </div>
        {overlayState.activePanel === 'visual' && <div className="overlay-panel-stack"><div className="layer-summary" aria-live="polite"><strong>{t('activeLayers', { count: activeLayers.length })}</strong>{activeLayers.length >= 3 && <small>{t('layerLimitReached')}</small>}{activeLayers.length === 0 && <small>{t('noActiveLayers')}</small>}</div><div className="overlay-option-list">{AVAILABLE_SCENE_LIST.map((scene) => { const copy = localizeScene(locale, scene.manifest.id); const layer = visualLayers.find((item) => item.sceneId === scene.manifest.id); const selected = selectedLayer?.id === layer?.id || (!layer && selectedLayer?.sceneId === scene.manifest.id); const enabled = Boolean(layer?.enabled); const canActivate = enabled || activeLayers.length < 3; return <div className={`overlay-option-row ${enabled ? 'active' : ''}`} key={scene.manifest.id}><button type="button" className={`overlay-option ${selected ? 'active' : ''}`} onClick={() => selectScene(scene.manifest.id)} aria-pressed={selected}><span className="overlay-option-icon" aria-hidden="true">{sceneIcon[scene.manifest.id]}</span><span><strong>{copy.name}</strong><small>{copy.description}</small></span>{selected && <b aria-hidden="true">✎</b>}</button><button type="button" className={`layer-toggle ${enabled ? 'active' : ''}`} onClick={() => toggleScene(scene.manifest.id)} disabled={!canActivate} aria-pressed={enabled} aria-label={t(enabled ? 'deactivateScene' : 'activateScene', { name: copy.name })}><span className="switch-track" aria-hidden="true"><span /></span></button></div>; })}</div><div className="overlay-inspector"><SectionLabel action={t('live')}>{t('response')}</SectionLabel><Slider label={t('energy')} value={activeSettings.energy} onChange={updateSetting('energy')} hint={t('overallLift')} /><Slider label={t('sensitivity')} value={activeSettings.sensitivity} onChange={updateSetting('sensitivity')} hint={t('audioResponse')} /><Slider label={t('motion')} value={activeSettings.motion} onChange={updateSetting('motion')} hint={t('animationTempo')} /><Slider label={t('density')} value={activeSettings.density} onChange={updateSetting('density')} hint={t('detailParticles')} /><Slider label={t('glow')} value={activeSettings.glow} onChange={updateSetting('glow')} hint={t('bloomIntensity')} /><div className="inspector-actions"><button className="text-button" type="button" onClick={resetScene}>{t('originalScene')}</button><button className="text-button" type="button" onClick={randomizeScene}>{t('randomScene')}</button></div></div></div>}
        {overlayState.activePanel === 'style' && <div className="overlay-option-list">{PALETTE_LIST.map((item) => { const copy = localizePalette(locale, item.id); return <button key={item.id} data-palette-id={item.id} data-selected-layer-id={selectedLayer.id} type="button" className={`overlay-option ${paletteId === item.id ? 'active' : ''}`} onClick={() => setLayerPalette(selectedLayer.id, item.id)} aria-pressed={paletteId === item.id} title={`${copy.name} — ${copy.description}`}><span className="palette-swatch" style={{ background: `linear-gradient(135deg, ${item.primary}, ${item.secondary}, ${item.accent})` }} /><span><strong>{copy.name}</strong><small>{copy.description}</small></span>{paletteId === item.id && <b aria-hidden="true">✓</b>}</button>; })}</div>}
        {overlayState.activePanel === 'audio' && <div className="overlay-panel-stack"><label className="project-name-field">{t('projectName')}<input value={projectName} onChange={(event) => setProjectName(event.target.value)} /></label><p className="overlay-copy">{audioState.name ? `${audioState.name} · ${formatTime(audioState.duration)}` : `${t('noAudioSelected')}. ${t('silencePreview')}`}</p><button className="secondary-button full-width" type="button" onClick={() => fileInputRef.current?.click()}>{t('chooseLocalMp3')}</button>{audioState.name && <button className="text-button" type="button" onClick={handleResetAudio}>{t('resetAudio')}</button>}<span className="overlay-hint">{t('audioBrowserHint')}</span></div>}
        {overlayState.activePanel === 'layout' && <div className="overlay-panel-stack layout-panel"><p className="overlay-copy">{t('layoutCopy')}</p><div className="profile-groups">{PROFILE_GROUPS.map((group) => <section className="profile-group" key={group.platform}><h3>{localizeProfilePlatform(locale, group.platform)}</h3><div className="overlay-option-list">{group.profiles.map((item) => <button key={item.id} data-profile-id={item.id} type="button" className={`overlay-option ${profileId === item.id ? 'active' : ''}`} onClick={() => setProfile(item.id)} aria-pressed={profileId === item.id}><span className="overlay-option-icon" aria-hidden="true">{item.orientation === 'portrait' ? '↕' : item.orientation === 'square' ? '□' : '↔'}</span><span><strong>{localizeProfileName(locale, item.name)}</strong><small>{localizeOrientation(locale, item.orientationLabel)} · {item.ratioLabel} · {item.resolution}</small></span>{profileId === item.id && <b aria-hidden="true">✓</b>}</button>)}</div></section>)}</div><p className="profile-selection" aria-live="polite">{t('active')}: <strong>{localizeProfileName(locale, profile.name)}</strong> · {profile.ratioLabel} · {profile.resolution}</p></div>}
        {overlayState.activePanel === 'import-export' && <div className="overlay-panel-stack export-panel"><p className="overlay-copy">{t('exportCopy')}</p><div className="export-grid"><label>{t('fps')}<select value={exportFps} disabled={isExporting} onChange={(event) => setExportFps(Number(event.target.value))}><option value="24">24</option><option value="30">30</option><option value="60">60</option></select></label><label>{t('lengthSeconds')}<input type="number" min="1" max="3600" step="1" value={exportDuration} disabled={isExporting} onChange={(event) => setExportDuration(Number(event.target.value))} /></label><label>{t('quality')}<select value={exportQuality} disabled={isExporting} onChange={(event) => setExportQuality(event.target.value as 'high' | 'balanced' | 'low')}><option value="high">{t('high')}</option><option value="balanced">{t('balanced')}</option><option value="low">{t('low')}</option></select></label></div><label className="export-checkbox"><input type="checkbox" checked={exportReducedMotion} disabled={isExporting} onChange={(event) => setExportReducedMotion(event.target.checked)} /> {t('reducedMotion')}</label><div className="export-actions"><button className="primary-button full-width" type="button" onClick={() => void handleExport()} disabled={isExporting || !audioState.name}>{isExporting ? t('exporting') : t('exportMp4')}</button>{isExporting && <button className="secondary-button full-width" type="button" onClick={handleCancelExport}>{t('cancelExport')}</button>}{exportBlob && <button className="secondary-button full-width" type="button" onClick={handleDownloadExport}>{t('downloadMp4', { size: Math.ceil(exportBlob.size / 1024) })}</button>}</div>{exportProgress && <div className="export-progress" role="status" aria-live="polite"><strong>{exportProgress.message}</strong><progress max={Math.max(1, exportProgress.total)} value={exportProgress.completed} /> <span>{exportProgress.state} · {exportProgress.completed}/{exportProgress.total}</span></div>}{exportError && <div className="preview-runtime-error" role="alert">{t('exportFailed')} {exportError}</div>}<span className="overlay-hint">{localizeProfileName(locale, profile.name)} · {profile.resolution}. {t('audioBrowserHint')}</span></div>}
        {overlayState.activePanel === 'presentation' && <div className="overlay-panel-stack"><p className="overlay-copy">{t('presentationCopy')}</p><button className="primary-button full-width" type="button" onClick={() => void handleToggleFullscreen()}>{t('enterPresentation')}</button><span className="overlay-hint">{t('escapeHint')}</span></div>}
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
            <p>{t('appSubtitle')}</p>
          </div>
        </div>
        <div className="topbar-center"><span className="live-dot" /> {t('previewLive')}</div>
        <div className="topbar-actions">
          <span className="export-pill">{isExporting ? t('exportRunning') : exportBlob ? t('exportReady') : t('exportWebCodecs')}</span>
          <label className="language-control"><span className="visually-hidden">{t('languageSelector')}</span><select aria-label={t('languageSelector')} value={locale} onChange={(event) => setLocale(event.target.value as typeof locale)}>{SUPPORTED_LOCALES.map((option) => <option key={option} value={option}>{t(LANGUAGE_NAME_KEYS[option])}</option>)}</select></label>
        </div>
      </header>

      <div className="workspace visualizer-workspace">
        <section className="stage" aria-label="Visualizer stage" onPointerDown={handlePresentationPointerDown} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
          <input ref={fileInputRef} id="audio-file" className="visually-hidden" type="file" accept="audio/mpeg,.mp3" aria-label="Audio file" onChange={handleFileChange} />
          <nav className="overlay-dock" aria-label={`${t('visual')} ${t('quickControls').toLowerCase()}`}>
            {OVERLAY_ACTIONS.map((action) => <button key={action.id} className={`overlay-dock-button ${overlayState.activePanel === action.id ? 'active' : ''}`} type="button" aria-label={t(OVERLAY_LABEL_KEYS[action.id])} aria-controls="visualizer-overlay-panel" aria-pressed={overlayState.activePanel === action.id} title={`${t(OVERLAY_LABEL_KEYS[action.id])} — ${t(OVERLAY_HINT_KEYS[action.id])}`} onClick={(event) => action.id === 'presentation' ? void handleToggleFullscreen() : openOverlayPanel(action.id, event.currentTarget)}><span className="dock-icon" aria-hidden="true"><DockIcon name={action.id} /></span><span className="dock-label">{t(OVERLAY_LABEL_KEYS[action.id])}</span></button>)}
          </nav>
          {renderOverlayPanel()}
          <div className="stage-toolbar shell-chrome">
            <div className="stage-breadcrumb"><span className="scene-badge">{sceneIcon[activeSceneId]}</span><div><strong>{activeSceneCopy.name}</strong><small>{activeModule.manifest.tags.join(' · ')}</small></div></div>
            <span className="frame-badge">{t('fpsTarget')}</span>
          </div>
          <div className="preview-shell">
            <div className="preview-layer-stack" data-active-layer-count={activeLayers.length} style={{ aspectRatio: profile.ratio }}>{activeLayers.map((layer, index) => <VisualizerCanvas key={`${layer.id}:${layer.sceneId}`} engine={engine} palette={PALETTES[layer.paletteId]} settings={layer.settings} sceneId={layer.sceneId} seed={layer.seed} profileId={profile.id} profileRatio={profile.ratio} ariaLabel={`${t('canvasAria')} · ${localizeScene(locale, layer.sceneId).name}`} layerId={layer.id} layerIndex={index} />)}{activeLayers.length === 0 && <div className="no-active-layers" role="status">{t('noActiveLayers')}</div>}</div>
            {!audioState.name && <div className="preview-empty" role="status" aria-live="polite"><div className="preview-empty-card"><div className="empty-orbit" aria-hidden="true">◌</div><strong>{t('loadMp3')}</strong><span>{t('previewAlreadySilence')}</span><button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()}>{t('chooseLocalMp3')}</button></div></div>}
            <div className="presentation-reveal" aria-live="polite"><button className="presentation-reveal-button" type="button" aria-label={t('showControls')} onClick={() => dispatchOverlay({ type: 'reveal-controls' })}>{t('showControls')}</button></div>
            {overlayState.mode === 'presentation' && overlayState.controlsVisible && <div className="presentation-controls" role="status"><span>{t('presentationMode')}</span><button className="presentation-exit-button" type="button" onClick={() => void handleToggleFullscreen()}>{t('exitPresentation')}</button></div>}
            <div className="preview-corner top-left"><span className="corner-dot" /> {localizeProfilePlatform(locale, profile.platform)} · {localizeProfileName(locale, profile.name)} · {profile.ratioLabel} · {profile.resolution}</div>
            <div className="preview-corner bottom-right">{t('moduleVersion')} · {localizePalette(locale, palette.id).name}</div>
            <footer className="transport floating-transport" aria-label={t('audioTransport')}>
              <div className="track-meta"><div className="track-art" aria-hidden="true">{audioState.name ? '♪' : '∅'}</div><div><strong>{audioState.name || t('noAudioSelected')}</strong><span>{audioState.name ? t('localAudioSource') : t('chooseMp3Begin')}</span></div></div>
              <div className="transport-center"><div className="transport-controls"><button type="button" className="transport-button" aria-label={t('previousPosition')} onClick={() => engine.seek(Math.max(0, audioState.currentTime - 10))}>↶</button><button type="button" className="play-button" aria-label={isPlaying ? t('pauseAudio') : t('playAudio')} onClick={() => void handleTogglePlayback()} disabled={!audioState.name}>{isPlaying ? 'Ⅱ' : '▶'}</button><button type="button" className="transport-button" aria-label={t('nextPosition')} onClick={() => engine.seek(Math.min(audioState.duration, audioState.currentTime + 10))}>↷</button></div><div className="timeline"><span>{formatTime(audioState.currentTime)}</span><input aria-label={t('playbackPosition')} type="range" min="0" max={audioState.duration || 1} step="0.1" value={Math.min(audioState.currentTime, audioState.duration || 1)} style={{ '--progress': `${progress}%` } as React.CSSProperties} onChange={(event) => engine.seek(Number(event.target.value))} /><span>{formatTime(audioState.duration)}</span></div></div>
              <div className="volume-control"><span aria-hidden="true">◖</span><input aria-label={t('volume')} type="range" min="0" max="1" step="0.01" value={audioState.volume} onChange={(event) => engine.setVolume(Number(event.target.value))} /></div>
            </footer>
          </div>
          <div className="stage-note shell-chrome"><span className="note-icon">i</span><span>{t('stageNote')}</span></div>
        </section>
      </div>
    </main>
  );
}

export default App;
