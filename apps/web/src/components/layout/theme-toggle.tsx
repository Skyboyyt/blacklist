'use client';

import { useSyncExternalStore } from 'react';
import { Icon, type IconName } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import {
  applyThemePreference,
  readThemePreference,
  THEME_PREFERENCES,
  type ThemePreference,
} from '@/lib/theme/theme';

const OPTIONS: Record<ThemePreference, { label: string; icon: IconName }> = {
  system: { label: 'System theme', icon: 'monitor' },
  light: { label: 'Light theme', icon: 'sun' },
  dark: { label: 'Dark theme', icon: 'moon' },
};

const CHANGE_EVENT = 'bl-theme-change';

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

const getSnapshot = () => readThemePreference(safeStorage());
// The server cannot know the stored choice; /theme-init.js applies it before paint.
const getServerSnapshot = (): ThemePreference => 'system';

export function ThemeToggle() {
  const preference = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function choose(next: ThemePreference) {
    applyThemePreference(next, document.documentElement, safeStorage());
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="flex rounded-md border border-border bg-surface-2 p-0.5"
    >
      {THEME_PREFERENCES.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => choose(p)}
          aria-pressed={preference === p}
          aria-label={OPTIONS[p].label}
          title={OPTIONS[p].label}
          className={cn(
            'flex size-8 items-center justify-center rounded text-muted hover:text-text',
            preference === p && 'bg-surface text-text shadow-sm',
          )}
        >
          <Icon name={OPTIONS[p].icon} className="size-4" />
        </button>
      ))}
    </div>
  );
}
