/**
 * Content Security Policy (ARCHITECTURE §26.1).
 *
 * Scripts: nonce + 'strict-dynamic' only — no inline or third-party scripts.
 * Styles (production): <style> elements need the per-request nonce (Radix's runtime
 * scroll-lock styles receive it via get-nonce, see components/layout/style-nonce.tsx).
 * Style ATTRIBUTES remain allowed (style-src-attr 'unsafe-inline'): they cannot carry
 * selectors, so the CSS-injection risk that remains is small. Removing that last
 * allowance is tracked for the Phase 6 quality pass. Development keeps inline styles
 * because hot reloading injects them.
 * Later phases add the evidence download origin (img-src) and the human-verification
 * and wallet origins (connect-src / frame-src) as ARCHITECTURE §26.1 specifies.
 */
/** Loopback hosts are served over plain HTTP in local runs and tests. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

/**
 * `upgrade-insecure-requests` is omitted for loopback hosts: WebKit (unlike Chromium and
 * Firefox) applies it to http://localhost and rewrites every asset to https, which
 * breaks local production-mode runs. Real deployments are HTTPS with HSTS (ARCHITECTURE
 * §26.1), which already forces the upgrade.
 */
export function buildContentSecurityPolicy(nonce: string, isDevelopment: boolean, hostname = ''): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ''}`,
    isDevelopment ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    ...(isDevelopment ? [] : ["style-src-attr 'unsafe-inline'"]),
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${isDevelopment ? ' ws: wss:' : ''}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (!isDevelopment && !isLoopbackHost(hostname)) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

/** Pages that read a one-time token from the URL fragment. */
export const TOKEN_PAGE_PREFIXES = [
  '/register/complete',
  '/reset-password',
  '/email-change/confirm',
  '/staff/enroll',
];

/**
 * Private or account-related areas: never cached by browsers or shared caches
 * (ARCHITECTURE §26.1: no-store on authenticated responses). Applies to prefetches too.
 */
export const NO_STORE_PREFIXES = [
  ...TOKEN_PAGE_PREFIXES,
  '/login',
  '/register',
  '/forgot-password',
  '/staff',
  '/dashboard',
  '/reports',
  '/appeals',
  '/responses',
  '/corrections',
  '/notifications',
  '/settings',
  '/mod',
  '/admin',
];

export function matchesPrefix(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}
