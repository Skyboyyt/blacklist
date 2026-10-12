import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyThemePreference, parseThemePreference, readThemePreference, THEME_STORAGE_KEY } from './theme';

describe('theme preference', () => {
  it('defaults to system for unknown or missing values', () => {
    expect(parseThemePreference(null)).toBe('system');
    expect(parseThemePreference('purple')).toBe('system');
    expect(parseThemePreference('dark')).toBe('dark');
  });

  it('applies and stores explicit choices; system clears both', () => {
    const root = document.documentElement;
    applyThemePreference('dark', root, window.localStorage);
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    applyThemePreference('system', root, window.localStorage);
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('survives storage that throws (private mode)', () => {
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    expect(readThemePreference(throwing)).toBe('system');
    expect(() => applyThemePreference('light', document.documentElement, throwing)).not.toThrow();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('keeps the pre-paint script in sync with the storage key', () => {
    const script = readFileSync(join(process.cwd(), 'public', 'theme-init.js'), 'utf8');
    expect(script).toContain(`'${THEME_STORAGE_KEY}'`);
  });
});
