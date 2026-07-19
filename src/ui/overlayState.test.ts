import { describe, expect, it } from 'vitest';
import {
  INITIAL_OVERLAY_STATE,
  reduceOverlayState,
  resolveEscapeAction,
  type OverlayState,
} from './overlayState';

describe('overlay state contract', () => {
  it('keeps at most one settings panel open and makes toggling idempotent', () => {
    const visualOpen = reduceOverlayState(INITIAL_OVERLAY_STATE, { type: 'open-panel', panel: 'visual' });
    const styleOpen = reduceOverlayState(visualOpen, { type: 'open-panel', panel: 'style' });
    const styleClosed = reduceOverlayState(styleOpen, { type: 'toggle-panel', panel: 'style' });

    expect(visualOpen.activePanel).toBe('visual');
    expect(styleOpen.activePanel).toBe('style');
    expect(styleClosed.activePanel).toBeNull();
    expect(styleClosed.controlsVisible).toBe(true);
  });

  it('applies Escape precedence: close panel, then leave presentation, then no-op', () => {
    const panelState = reduceOverlayState(INITIAL_OVERLAY_STATE, { type: 'open-panel', panel: 'audio' });
    const presentationState = reduceOverlayState(panelState, { type: 'enter-presentation' });

    expect(resolveEscapeAction(panelState)).toBe('close-panel');
    expect(resolveEscapeAction(presentationState)).toBe('exit-presentation');
    expect(resolveEscapeAction(INITIAL_OVERLAY_STATE)).toBe('noop');
    expect(reduceOverlayState(panelState, { type: 'escape' })).toEqual({
      ...INITIAL_OVERLAY_STATE,
      activePanel: null,
    });
    expect(reduceOverlayState(presentationState, { type: 'escape' })).toEqual(INITIAL_OVERLAY_STATE);
  });

  it('enters capture mode by clearing panels and hiding controls without changing audio state', () => {
    const editing: OverlayState = {
      ...INITIAL_OVERLAY_STATE,
      activePanel: 'layout',
    };
    const capture = reduceOverlayState(editing, { type: 'enter-presentation' });
    const editingAgain = reduceOverlayState(capture, { type: 'exit-presentation' });

    expect(capture).toMatchObject({ mode: 'presentation', activePanel: null, controlsVisible: false });
    expect(editingAgain).toEqual(INITIAL_OVERLAY_STATE);
  });

  it('does not open panels while controls are locked, but keeps a safe unlock action', () => {
    const locked = reduceOverlayState(INITIAL_OVERLAY_STATE, { type: 'toggle-lock' });
    const attemptedOpen = reduceOverlayState(locked, { type: 'open-panel', panel: 'visual' });
    const unlocked = reduceOverlayState(locked, { type: 'toggle-lock' });

    expect(attemptedOpen).toEqual(locked);
    expect(unlocked.controlsLocked).toBe(false);
  });
});
