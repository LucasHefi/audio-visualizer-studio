import { describe, expect, it } from 'vitest';
import { CANVAS_PROFILES, DEFAULT_CANVAS_PROFILE_ID, LEGACY_PROFILE_MIGRATIONS, PROFILE_GROUPS, PROFILE_LIST } from './catalog';

describe('canvas profile catalog', () => {
  it('contains the complete platform and orientation matrix', () => {
    expect(PROFILE_LIST).toHaveLength(8);
    expect(PROFILE_LIST.map((profile) => profile.id)).toEqual([
      'youtube-landscape', 'youtube-portrait', 'tiktok-portrait', 'tiktok-landscape',
      'instagram-portrait', 'instagram-square', 'instagram-landscape', 'custom-18-9',
    ]);
    expect(CANVAS_PROFILES['youtube-landscape']).toMatchObject({ platform: 'YouTube', orientation: 'landscape', ratioLabel: '16:9', resolution: '1920 × 1080' });
    expect(CANVAS_PROFILES['youtube-portrait']).toMatchObject({ platform: 'YouTube', orientation: 'portrait', ratioLabel: '9:16' });
    expect(CANVAS_PROFILES['tiktok-landscape']).toMatchObject({ platform: 'TikTok', orientation: 'landscape', ratioLabel: '16:9' });
    expect(CANVAS_PROFILES['instagram-portrait']).toMatchObject({ platform: 'Instagram', orientation: 'portrait', ratioLabel: '4:5' });
    expect(CANVAS_PROFILES['instagram-square']).toMatchObject({ platform: 'Instagram', orientation: 'square', ratioLabel: '1:1' });
    expect(CANVAS_PROFILES['instagram-landscape']).toMatchObject({ platform: 'Instagram', orientation: 'landscape', ratioLabel: '1.91:1' });
  });

  it('groups profiles for the layout panel and keeps a safe default/migration map', () => {
    expect(PROFILE_GROUPS.map((group) => group.platform)).toEqual(['YouTube', 'TikTok', 'Instagram', 'Custom']);
    expect(DEFAULT_CANVAS_PROFILE_ID).toBe('youtube-landscape');
    expect(LEGACY_PROFILE_MIGRATIONS).toEqual({ wide: 'youtube-landscape', vertical: 'youtube-portrait', feed: 'instagram-square', '18-9': 'custom-18-9' });
  });
});
