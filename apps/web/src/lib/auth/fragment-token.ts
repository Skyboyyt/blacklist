/**
 * Token pages receive their one-time token in the URL fragment (`#token=…`), which
 * browsers never send to servers or in Referer headers. The page reads it once,
 * removes it from the address bar and history entry, and keeps it in memory only
 * until it is POSTed (identity design §6).
 */
import { flowTokenSchema } from '@blacklist/contracts';

export type FragmentToken =
  | { readonly kind: 'present'; readonly token: string }
  | { readonly kind: 'missing' }
  | { readonly kind: 'malformed' };

export function parseFragmentToken(hash: string): FragmentToken {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const token = params.get('token');
  if (token === null || token === '') return { kind: 'missing' };
  return flowTokenSchema.safeParse(token).success ? { kind: 'present', token } : { kind: 'malformed' };
}

/** Reads the token from `window.location` and strips the fragment without adding a history entry. */
export function takeFragmentToken(win: Pick<Window, 'location' | 'history'>): FragmentToken {
  const result = parseFragmentToken(win.location.hash);
  if (win.location.hash) {
    win.history.replaceState(win.history.state, '', `${win.location.pathname}${win.location.search}`);
  }
  return result;
}
