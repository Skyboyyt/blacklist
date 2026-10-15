/**
 * Next.js 16 proxy (formerly middleware). Responsibilities: per-request CSP nonce
 * and security headers, plus a server-only staging ingress credential. It never makes
 * user authorization decisions — the API
 * enforces every permission (ARCHITECTURE §9, §26).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { stagingGatewayHeaders } from './lib/security/staging-gateway';
import { clientIpGatewayHeaders } from './lib/security/client-ip';
import { canonicalRedirectUrl } from './lib/security/canonical-origin';
import {
  buildContentSecurityPolicy,
  matchesPrefix,
  NO_STORE_PREFIXES,
  TOKEN_PAGE_PREFIXES,
} from './lib/security/csp';

const MOCK_SESSION_COOKIE = 'bl_mock_session';

export function proxy(request: NextRequest) {
  // Malformed percent-encoding: answer 400 instead of letting route decoding fail with a 500.
  try {
    decodeURIComponent(request.nextUrl.pathname);
  } catch {
    return new NextResponse('Bad request', {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const canonical = canonicalRedirectUrl(
    request.nextUrl,
    process.env['CANONICAL_APP_ORIGIN'],
    request.method,
  );
  if (canonical) {
    const response = NextResponse.redirect(canonical, 307);
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = buildContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === 'development',
    request.nextUrl.hostname,
  );

  const requestHeaders = clientIpGatewayHeaders(
    request.nextUrl.pathname,
    stagingGatewayHeaders(request.nextUrl.pathname, request.headers),
  );
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  // Mock builds only: give each browser its own demo-data session (not authentication).
  const mockSession =
    process.env.NEXT_PUBLIC_API_MODE === 'mock' && !request.cookies.has(MOCK_SESSION_COOKIE)
      ? crypto.randomUUID()
      : null;
  if (mockSession) {
    const existing = requestHeaders.get('cookie');
    requestHeaders.set('cookie', `${existing ? `${existing}; ` : ''}${MOCK_SESSION_COOKIE}=${mockSession}`);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  if (mockSession) {
    response.cookies.set(MOCK_SESSION_COOKIE, mockSession, { httpOnly: true, sameSite: 'lax', path: '/' });
  }

  const path = request.nextUrl.pathname;
  // Token pages: never leak the URL (the token itself is in the fragment) via Referer.
  if (matchesPrefix(path, TOKEN_PAGE_PREFIXES)) response.headers.set('Referrer-Policy', 'no-referrer');
  // Account, auth and staff pages are never cached.
  if (matchesPrefix(path, NO_STORE_PREFIXES)) response.headers.set('Cache-Control', 'no-store');
  return response;
}

/**
 * Runs for every page and RSC request, INCLUDING prefetches: security headers must never
 * depend on caller-controlled request metadata such as 'purpose: prefetch' (review P1-04).
 * Each response carries its own nonce, matching the scripts it renders.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|theme-init.js).*)'],
};
