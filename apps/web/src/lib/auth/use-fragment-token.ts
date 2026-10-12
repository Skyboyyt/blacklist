'use client';

import { useEffect, useRef, useState } from 'react';
import { takeFragmentToken, type FragmentToken } from './fragment-token';

export type FragmentTokenState = { readonly kind: 'reading' } | FragmentToken;

/**
 * Reads the one-time token from the URL fragment after mount and strips it from
 * the address bar. The token is held in memory only, never in storage or a URL.
 * The first read is cached so a repeated effect (React Strict Mode) does not see
 * the already-stripped fragment.
 */
export function useFragmentToken(): FragmentTokenState {
  const taken = useRef<FragmentToken | null>(null);
  const [state, setState] = useState<FragmentTokenState>({ kind: 'reading' });
  useEffect(() => {
    taken.current ??= takeFragmentToken(window);
    setState(taken.current);
  }, []);
  return state;
}
