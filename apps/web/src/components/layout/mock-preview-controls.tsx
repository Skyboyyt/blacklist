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
import { resetDemoData } from '@/lib/api/browser';

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
 * Restores this browser's demo data (submissions, decisions, published results) to the
 * fixtures. The store is per demo session on the mock server; nothing real is reset.
 */
function ResetDemoData() {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'failed'>('idle');
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        disabled={state === 'pending'}
        onClick={() => {
          setState('pending');
          resetDemoData().then(
            () => {
              setState('done');
              router.refresh();
            },
            () => setState('failed'),
          );
        }}
        className="h-7 rounded border border-border-strong bg-surface px-2 text-xs text-text hover:bg-surface-2 disabled:opacity-60"
      >
        Reset demo data
      </button>
      <span role="status" className="text-xs">
        {state === 'done' ? 'Demo data reset.' : state === 'failed' ? 'Reset failed. Try again.' : ''}
      </span>
    </span>
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
      <ResetDemoData />
    </div>
  );
}
