import { describe, expect, it } from 'vitest';
import styles from './styles.css?raw';

describe('mobile transport layout contract', () => {
  it('pins the existing transport to the mobile viewport and reserves safe-area space', () => {
    const mobileRules = styles.match(/@media \(max-width: 860px\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
    const narrowRules = styles.match(/@media \(max-width: 560px\) \{([\s\S]*?)\n\}/)?.[1] ?? '';

    expect(mobileRules).toContain('position: fixed');
    expect(mobileRules).toContain('inset-inline: 0');
    expect(mobileRules).toContain('z-index: 20');
    expect(mobileRules).toContain('env(safe-area-inset-bottom, 0px)');
    expect(narrowRules).toContain('.studio-shell { padding-bottom: calc(142px + env(safe-area-inset-bottom, 0px)); }');
  });
});
