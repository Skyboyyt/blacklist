/**
 * Theme preference: light, dark or system (default).
 *
 * - `system` means no `data-theme` attribute: CSS follows `prefers-color-scheme`,
 *   which also works without JavaScript.
 * - An explicit choice is stored in localStorage (a non-sensitive preference) and
 *   applied before first paint by /theme-init.js, so there is no flash.
 * Keep THEME_STORAGE_KEY in sync with public/theme-init.js.
 */
export const THEME_STORAGE_KEY = 'bl-theme';
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export function parseThemePreference(value: string | null | undefined): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function readThemePreference(storage: Pick<Storage, 'getItem'> | undefined): ThemePreference {
  try {
    return parseThemePreference(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

export function applyThemePreference(
  preference: ThemePreference,
  root: HTMLElement,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined,
): void {
  if (preference === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', preference);
  }
  try {
    if (preference === 'system') storage?.removeItem(THEME_STORAGE_KEY);
    else storage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage may be unavailable (private mode); the choice then lasts for this page only.
  }
}
