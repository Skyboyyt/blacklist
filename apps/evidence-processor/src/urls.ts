// ADR 0020: the processor holds no secrets and is reachable from the internet on staging.
// It only works on presigned, path-style URLs for our own storage host, buckets and key
// prefixes. Nobody can create such URLs without our storage keys, so it cannot be fed
// outside files or made to write anywhere else.

export interface StorageTarget {
  /** Storage endpoint origin, e.g. `https://s3.eu-central-003.backblazeb2.com`. */
  origin: string;
  quarantineBucket: string;
  derivativesBucket: string;
}

export const QUARANTINE_PREFIX = 'quarantine/';
export const DERIVATIVE_PREFIX = 'derivative/';
const KEY = /^[a-z]+\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/;

function allowed(raw: string, target: StorageTarget, bucket: string, prefix: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.origin !== target.origin || url.username || url.password || url.hash) return false;
  if (!url.searchParams.has('X-Amz-Signature') || !url.searchParams.has('X-Amz-Expires')) return false;
  const [, first, ...rest] = url.pathname.split('/');
  const key = rest.join('/');
  return first === bucket && key.startsWith(prefix) && KEY.test(key);
}

export function allowedSource(raw: string, target: StorageTarget) {
  return allowed(raw, target, target.quarantineBucket, QUARANTINE_PREFIX);
}

export function allowedDestination(raw: string, target: StorageTarget) {
  return allowed(raw, target, target.derivativesBucket, DERIVATIVE_PREFIX);
}
