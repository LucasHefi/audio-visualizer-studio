import { describe, expect, it } from 'vitest';
import { detectLocale, localizeScene, normalizeLocale, SUPPORTED_LOCALES, TRANSLATIONS, translate } from './i18n';

describe('locale catalog', () => {
  it('covers every supported locale with the same complete key set', () => {
    const expected = Object.keys(TRANSLATIONS.en).sort();
    expect(SUPPORTED_LOCALES).toHaveLength(7);
    for (const locale of SUPPORTED_LOCALES) expect(Object.keys(TRANSLATIONS[locale]).sort()).toEqual(expected);
  });

  it('normalizes browser tags and falls back to English for unsupported locales', () => {
    expect(normalizeLocale('cs-CZ')).toBe('cs');
    expect(normalizeLocale('pl-PL')).toBe('pl');
    expect(normalizeLocale('pt-BR')).toBe('en');
    expect(detectLocale({ language: 'de-DE', languages: ['de-DE', 'en-US'] })).toBe('de');
    expect(detectLocale({ language: 'xx', languages: ['xx', 'en-US'] })).toBe('en');
    expect(detectLocale({ language: 'en-US', languages: ['en-US'] }, { getItem: () => 'cs' })).toBe('cs');
  });

  it('translates a parameterized string and scene metadata without missing keys', () => {
    expect(translate('cs', 'closeSettings', { name: 'Styl' })).toContain('Styl');
    expect(localizeScene('cs', '3d-spectrum').name).toBe('3D Spektrum');
    expect(localizeScene('de', '3d-spectrum').description).toContain('Perspektivischer');
  });
});
