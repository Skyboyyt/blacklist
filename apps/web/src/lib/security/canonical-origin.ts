/** A deployment setting chooses the host; caller-controlled paths cannot choose an origin. */
export function canonicalRedirectUrl(request: URL, configured: string | undefined, method: string) {
  if (!configured) return null;
  let canonical: URL;
  try {
    canonical = new URL(configured);
    if (
      canonical.protocol !== 'https:' ||
      canonical.username ||
      canonical.password ||
      canonical.pathname !== '/' ||
      canonical.search ||
      canonical.hash
    )
      throw new Error();
  } catch {
    throw new Error('Invalid CANONICAL_APP_ORIGIN');
  }
  if (
    !['GET', 'HEAD'].includes(method) ||
    request.origin === canonical.origin ||
    request.pathname === '/api' ||
    request.pathname.startsWith('/api/') ||
    request.pathname.startsWith('/_next/')
  )
    return null;
  // Set fields instead of resolving a path: //foreign.example must remain a path.
  canonical.pathname = request.pathname;
  canonical.search = request.search;
  return canonical;
}
