import type { CanvasProfile, Palette, PaletteId, CanvasProfileId } from '../types';

export const PALETTES: Record<PaletteId, Palette> = {
  aurora: {
    id: 'aurora', name: 'Aurora', description: 'Cool mint with a warm signal', background: '#08131a', surface: '#122b31', primary: '#70f1c8', secondary: '#60a5fa', accent: '#f6c453', muted: '#7c98a0',
  },
  ember: {
    id: 'ember', name: 'Ember', description: 'Copper, coral and midnight', background: '#1b0d11', surface: '#3a1c22', primary: '#ff9a76', secondary: '#ff5c8a', accent: '#ffd166', muted: '#b78b87',
  },
  mono: {
    id: 'mono', name: 'Monochrome', description: 'Quiet graphite and electric white', background: '#0d1018', surface: '#242a36', primary: '#f4f4f5', secondary: '#a1a1aa', accent: '#e2e8f0', muted: '#71717a',
  },
  ocean: {
    id: 'ocean', name: 'Deep ocean', description: 'Blue depth with a violet edge', background: '#080f22', surface: '#16254a', primary: '#7dd3fc', secondary: '#818cf8', accent: '#c4b5fd', muted: '#8194b8',
  },
};

export const PALETTE_LIST = Object.values(PALETTES);

export const CANVAS_PROFILES: Record<CanvasProfileId, CanvasProfile> = {
  wide: { id: 'wide', name: 'Wide', ratio: 16 / 9, resolution: '1920 × 1080' },
  vertical: { id: 'vertical', name: 'Vertical', ratio: 9 / 16, resolution: '1080 × 1920' },
  feed: { id: 'feed', name: 'Feed', ratio: 1, resolution: '1080 × 1080' },
  '18-9': { id: '18-9', name: '18:9', ratio: 18 / 9, resolution: '2160 × 1080' },
};

export const PROFILE_LIST = Object.values(CANVAS_PROFILES);
