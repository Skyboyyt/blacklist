'use client';

import type { PasskeyResult } from '@blacklist/contracts';
import { useCallback, useRef, useState } from 'react';

/**
 * Shared state for a WebAuthn ceremony (staff sign-in, step-up, enrollment).
 *
 *   idle ──start──► waiting ──► verified | cancelled | timed_out | unsupported | failed | session_expired
 *     ▲                                       │
 *     └──────────────── reset / retry ◄───────┘
 *
 * The browser only reports what the API concluded: it never verifies a credential.
 * Feature detection (`PublicKeyCredential`) short-circuits to `unsupported`.
 */
export type PasskeyCeremonyState =
  { readonly status: 'idle' } | { readonly status: 'waiting' } | { readonly status: PasskeyResult['kind'] };

export function webAuthnSupported(
  win: Window | undefined = typeof window === 'undefined' ? undefined : window,
): boolean {
  return win !== undefined && 'PublicKeyCredential' in win;
}

export function usePasskeyCeremony(run: () => Promise<PasskeyResult>) {
  const [state, setState] = useState<PasskeyCeremonyState>({ status: 'idle' });
  const inFlight = useRef(false);

  const start = useCallback(async (): Promise<PasskeyResult['kind'] | null> => {
    if (inFlight.current) return null; // one ceremony at a time
    if (!webAuthnSupported()) {
      setState({ status: 'unsupported' });
      return 'unsupported';
    }
    inFlight.current = true;
    setState({ status: 'waiting' });
    try {
      const result = await run();
      setState({ status: result.kind });
      return result.kind;
    } catch {
      setState({ status: 'failed' });
      return 'failed';
    } finally {
      inFlight.current = false;
    }
  }, [run]);

  const reset = useCallback(() => setState({ status: 'idle' }), []);
  return { state, start, reset };
}
