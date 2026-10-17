import { createHash, createHmac } from 'node:crypto';

// AWS Signature Version 4, query-string ("presigned URL") form, for S3-compatible
// storage. Small enough to read in full; tested against AWS's published example.

export interface SigningKey {
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

const encode = (value: string) =>
  encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const hmac = (key: string | Buffer, value: string) => createHmac('sha256', key).update(value).digest();
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * A presigned URL for `method` on `url` (path-style, no query), valid for `expiresSeconds`.
 * Only the host header is signed; `query` adds response overrides such as
 * `response-content-disposition`.
 */
export function presign(
  key: SigningKey,
  request: {
    method: 'GET' | 'PUT' | 'DELETE' | 'HEAD';
    url: string;
    expiresSeconds: number;
    now: Date;
    query?: Readonly<Record<string, string>>;
  },
): string {
  const url = new URL(request.url);
  if (url.search || url.hash || url.username || url.password) throw new Error('presign_invalid_url');
  if (
    !Number.isInteger(request.expiresSeconds) ||
    request.expiresSeconds < 1 ||
    request.expiresSeconds > 604800
  )
    throw new Error('presign_invalid_expiry');
  const amzDate = request.now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${key.region}/s3/aws4_request`;
  const params: Record<string, string> = {
    ...request.query,
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${key.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(request.expiresSeconds),
    'X-Amz-SignedHeaders': 'host',
  };
  const query = Object.keys(params)
    .sort()
    .map((name) => `${encode(name)}=${encode(params[name] ?? '')}`)
    .join('&');
  const path = url.pathname
    .split('/')
    .map((segment) => encode(decodeURIComponent(segment)))
    .join('/');
  const canonical = [request.method, path, query, `host:${url.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join(
    '\n',
  );
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${key.secretAccessKey}`, day), key.region), 's3'),
    'aws4_request',
  );
  const signature = createHmac('sha256', signingKey).update(toSign).digest('hex');
  return `${url.origin}${path}?${query}&X-Amz-Signature=${signature}`;
}
