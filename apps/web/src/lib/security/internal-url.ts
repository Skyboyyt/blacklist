/** HTTPS only, except plain HTTP to a loopback host for local development. */
export function allowedInternalUrl(url: URL): boolean {
  if (url.username || url.password) return false;
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}
