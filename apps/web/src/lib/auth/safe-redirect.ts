/**
 * Validates the `next` redirect parameter (identity design §11): only a
 * same-origin relative path is accepted. Anything else falls back to the default.
 *
 * Rejected: absolute URLs, protocol-relative `//host`, backslash tricks `/\host`,
 * control characters, and auth-flow pages (to avoid redirect loops).
 */
const FALLBACK = '/dashboard';
const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];

export function safeNextPath(raw: string | null | undefined, fallback = FALLBACK): string {
  if (!raw || raw.length > 512) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  if (hasControlOrBackslash(raw)) return fallback;

  let url: URL;
  try {
    url = new URL(raw, 'https://same-origin.invalid');
  } catch {
    return fallback;
  }
  if (url.origin !== 'https://same-origin.invalid') return fallback;
  if (AUTH_PATHS.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** True for C0 control characters, DEL, or a backslash (browsers treat `\` like `/`). */
function hasControlOrBackslash(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f || code === 0x5c) return true;
  }
  return false;
}
