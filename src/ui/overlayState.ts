export const OVERLAY_PANEL_IDS = [
  'visual',
  'style',
  'audio',
  'layout',
  'import-export',
  'presentation',
] as const;

export type OverlayPanelId = (typeof OVERLAY_PANEL_IDS)[number];
export type OverlayMode = 'edit' | 'presentation';

export interface OverlayState {
  mode: OverlayMode;
  activePanel: OverlayPanelId | null;
  controlsVisible: boolean;
  autoHideEnabled: boolean;
  controlsLocked: boolean;
}

export type OverlayAction =
  | { type: 'open-panel'; panel: OverlayPanelId }
  | { type: 'toggle-panel'; panel: OverlayPanelId }
  | { type: 'close-panel' }
  | { type: 'enter-presentation' }
  | { type: 'exit-presentation' }
  | { type: 'toggle-presentation' }
  | { type: 'reveal-controls' }
  | { type: 'hide-controls' }
  | { type: 'toggle-auto-hide' }
  | { type: 'toggle-lock' }
  | { type: 'escape' };

export const INITIAL_OVERLAY_STATE: OverlayState = {
  mode: 'edit',
  activePanel: null,
  controlsVisible: true,
  autoHideEnabled: true,
  controlsLocked: false,
};

export type EscapeResult = 'close-panel' | 'exit-presentation' | 'noop';

export function resolveEscapeAction(state: OverlayState): EscapeResult {
  if (state.activePanel) return 'close-panel';
  if (state.mode === 'presentation') return 'exit-presentation';
  return 'noop';
}

export function reduceOverlayState(state: OverlayState, action: OverlayAction): OverlayState {
  switch (action.type) {
    case 'open-panel':
      if (state.controlsLocked) return state;
      return {
        ...state,
        mode: 'edit',
        activePanel: action.panel,
        controlsVisible: true,
      };
    case 'toggle-panel':
      if (state.controlsLocked) return state;
      return state.activePanel === action.panel
        ? { ...state, activePanel: null, controlsVisible: true }
        : { ...state, mode: 'edit', activePanel: action.panel, controlsVisible: true };
    case 'close-panel':
      return { ...state, activePanel: null, controlsVisible: true };
    case 'enter-presentation':
      return { ...state, mode: 'presentation', activePanel: null, controlsVisible: false };
    case 'exit-presentation':
      return { ...state, mode: 'edit', activePanel: null, controlsVisible: true };
    case 'toggle-presentation':
      return state.mode === 'presentation'
        ? reduceOverlayState(state, { type: 'exit-presentation' })
        : reduceOverlayState(state, { type: 'enter-presentation' });
    case 'reveal-controls':
      return { ...state, controlsVisible: true };
    case 'hide-controls':
      if (!state.autoHideEnabled && state.mode !== 'presentation') return state;
      return { ...state, controlsVisible: false, activePanel: null };
    case 'toggle-auto-hide':
      return { ...state, autoHideEnabled: !state.autoHideEnabled, controlsVisible: true };
    case 'toggle-lock':
      return { ...state, controlsLocked: !state.controlsLocked };
    case 'escape': {
      const escapeAction = resolveEscapeAction(state);
      if (escapeAction === 'close-panel') return reduceOverlayState(state, { type: 'close-panel' });
      if (escapeAction === 'exit-presentation') return reduceOverlayState(state, { type: 'exit-presentation' });
      return state;
    }
  }
}
