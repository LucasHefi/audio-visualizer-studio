import type { CanvasPlatform, CanvasProfile, CanvasProfileId, CanvasOrientation, LegacyCanvasProfileId, Palette, PaletteId } from '../types';

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
  ruby: {
    id: 'ruby', name: 'Ruby', description: 'Ruby red, rose pink and ink', background: '#16070d', surface: '#3b101e', primary: '#e11d48', secondary: '#fb7185', accent: '#f9a8d4', muted: '#c08497',
  },
  emerald: {
    id: 'emerald', name: 'Emerald', description: 'Emerald green with deep teal', background: '#061713', surface: '#0f3a2d', primary: '#34d399', secondary: '#10b981', accent: '#a7f3d0', muted: '#6cae99',
  },
  'ice-cold': {
    id: 'ice-cold', name: 'Ice cold', description: 'Arctic blue, white and violet', background: '#07111f', surface: '#16304b', primary: '#bae6fd', secondary: '#38bdf8', accent: '#e0e7ff', muted: '#8aa7bd',
  },
};

export const PALETTE_LIST = Object.values(PALETTES);

export const CANVAS_PROFILES: Record<CanvasProfileId, CanvasProfile> = {
  'youtube-landscape': { id: 'youtube-landscape', name: 'YouTube Landscape', platform: 'YouTube', orientation: 'landscape', orientationLabel: 'Landscape', ratioLabel: '16:9', ratio: 16 / 9, width: 1920, height: 1080, resolution: '1920 × 1080' },
  'youtube-portrait': { id: 'youtube-portrait', name: 'YouTube Shorts', platform: 'YouTube', orientation: 'portrait', orientationLabel: 'Portrait', ratioLabel: '9:16', ratio: 9 / 16, width: 1080, height: 1920, resolution: '1080 × 1920' },
  'tiktok-portrait': { id: 'tiktok-portrait', name: 'TikTok Portrait', platform: 'TikTok', orientation: 'portrait', orientationLabel: 'Portrait', ratioLabel: '9:16', ratio: 9 / 16, width: 1080, height: 1920, resolution: '1080 × 1920' },
  'tiktok-landscape': { id: 'tiktok-landscape', name: 'TikTok Landscape', platform: 'TikTok', orientation: 'landscape', orientationLabel: 'Landscape', ratioLabel: '16:9', ratio: 16 / 9, width: 1920, height: 1080, resolution: '1920 × 1080' },
  'instagram-portrait': { id: 'instagram-portrait', name: 'Instagram Portrait', platform: 'Instagram', orientation: 'portrait', orientationLabel: 'Portrait', ratioLabel: '4:5', ratio: 4 / 5, width: 1080, height: 1350, resolution: '1080 × 1350' },
  'instagram-square': { id: 'instagram-square', name: 'Instagram Square', platform: 'Instagram', orientation: 'square', orientationLabel: 'Square', ratioLabel: '1:1', ratio: 1, width: 1080, height: 1080, resolution: '1080 × 1080' },
  'instagram-landscape': { id: 'instagram-landscape', name: 'Instagram Landscape', platform: 'Instagram', orientation: 'landscape', orientationLabel: 'Landscape', ratioLabel: '1.91:1', ratio: 1.91, width: 1080, height: 566, resolution: '1080 × 566' },
  'custom-18-9': { id: 'custom-18-9', name: 'Custom 18:9', platform: 'Custom', orientation: 'landscape', orientationLabel: 'Landscape', ratioLabel: '18:9', ratio: 18 / 9, width: 2160, height: 1080, resolution: '2160 × 1080' },
};

export const PROFILE_LIST = Object.values(CANVAS_PROFILES);

export const DEFAULT_CANVAS_PROFILE_ID: CanvasProfileId = 'youtube-landscape';
export const PROFILE_PLATFORM_ORDER: CanvasPlatform[] = ['YouTube', 'TikTok', 'Instagram', 'Custom'];
export const PROFILE_GROUPS = PROFILE_PLATFORM_ORDER.map((platform) => ({
  platform,
  profiles: PROFILE_LIST.filter((profile) => profile.platform === platform),
}));

export const LEGACY_PROFILE_MIGRATIONS: Record<LegacyCanvasProfileId, CanvasProfileId> = {
  wide: 'youtube-landscape',
  vertical: 'youtube-portrait',
  feed: 'instagram-square',
  '18-9': 'custom-18-9',
};

export const normalizeCanvasProfileId = (value: unknown): CanvasProfileId => {
  if (typeof value !== 'string') return DEFAULT_CANVAS_PROFILE_ID;
  if (value in CANVAS_PROFILES) return value as CanvasProfileId;
  if (value in LEGACY_PROFILE_MIGRATIONS) return LEGACY_PROFILE_MIGRATIONS[value as LegacyCanvasProfileId];
  return DEFAULT_CANVAS_PROFILE_ID;
};

export const canvasOrientationLabel: Record<CanvasOrientation, string> = {
  landscape: 'Landscape',
  portrait: 'Portrait',
  square: 'Square',
};
