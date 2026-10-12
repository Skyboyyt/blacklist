/**
 * State machine for the search box while the user types:
 *
 *   idle ──input──► typing ──(debounce elapsed)──► detected | invalid | unsupported | ambiguous
 *     ▲                                             │
 *     └──────────────── clear ◄─────────────────────┘
 *
 * Remote states (loading, results, not found, provider unavailable, error) belong
 * to the results page, which renders the API response.
 */
import { classifyInput, type Classification } from './classify';

export type SearchInputState =
  | { readonly status: 'idle'; readonly value: '' }
  | { readonly status: 'typing'; readonly value: string }
  | { readonly status: 'detected'; readonly value: string; readonly classification: Classification };

export type SearchInputEvent =
  | { readonly type: 'input'; readonly value: string }
  | { readonly type: 'detect' }
  | { readonly type: 'clear' };

export const initialSearchInputState: SearchInputState = { status: 'idle', value: '' };

export function searchInputReducer(state: SearchInputState, event: SearchInputEvent): SearchInputState {
  switch (event.type) {
    case 'clear':
      return initialSearchInputState;
    case 'input':
      return event.value.trim().length === 0
        ? initialSearchInputState
        : { status: 'typing', value: event.value };
    case 'detect':
      if (state.status !== 'typing') return state;
      return { status: 'detected', value: state.value, classification: classifyInput(state.value) };
  }
}

/** Builds the results URL for a query, optionally pinned to a network. */
export function searchHref(value: string, chain?: string): string {
  const params = new URLSearchParams({ q: value.trim() });
  if (chain) params.set('chain', chain);
  return `/search?${params.toString()}`;
}
