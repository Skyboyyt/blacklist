'use client';

import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';
import {
  MOCK_COOKIES,
  MOCK_PASSKEY_RESULTS,
  MOCK_SCENARIOS,
  MOCK_VIEWERS,
  currentPasskeyResult,
  currentScenario,
  currentViewerKey,
} from '@/lib/api/mock/scenario';

const noSubscription = () => () => {};
const browserCookies = () => document.cookie;

interface ControlProps {
  readonly label: string;
  readonly cookie: string;
  readonly options: readonly string[];
  readonly read: (cookies: string) => string;
  readonly fallback: string;
}

function PreviewSelect({ label, cookie, options, read, fallback }: ControlProps) {
  const router = useRouter();
  const fromCookie = useSyncExternalStore(
    noSubscription,
    () => read(browserCookies()),
    () => fallback,
  );
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <label className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      <select
        value={selected ?? fromCookie}
        onChange={(e) => {
          setSelected(e.target.value);
          document.cookie = `${cookie}=${e.target.value}; path=/; SameSite=Lax`;
          router.refresh();
        }}
        className="h-7 rounded border border-border-strong bg-surface px-1 text-xs text-text"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o.replace(/_/g, ' ')}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Mock-only preview controls: which fictional viewer, account scenario and simulated
 * authenticator result the mock returns. They change mock data only and grant nothing.
 */
export function MockPreviewControls() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
      <PreviewSelect
        label="Preview as"
        cookie={MOCK_COOKIES.viewer}
        options={MOCK_VIEWERS}
        read={currentViewerKey}
        fallback="member"
      />
      <PreviewSelect
        label="Scenario"
        cookie={MOCK_COOKIES.scenario}
        options={MOCK_SCENARIOS}
        read={currentScenario}
        fallback="normal"
      />
      <PreviewSelect
        label="Passkey"
        cookie={MOCK_COOKIES.passkey}
        options={MOCK_PASSKEY_RESULTS}
        read={currentPasskeyResult}
        fallback="verified"
      />
    </div>
  );
}
