import { describe, expect, it } from 'vitest';
import { presign } from '../../../packages/domain/src/evidence/signer.ts';

// AWS's published SigV4 query-string example (S3 API reference, "Authenticating Requests:
// Using Query Parameters"). The expected signature comes from AWS, not from this code.
const key = {
  region: 'us-east-1',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
};

describe('SigV4 presigned URLs', () => {
  it('matches the AWS documentation example exactly', () => {
    const url = presign(key, {
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      expiresSeconds: 86400,
      now: new Date('2013-05-24T00:00:00Z'),
    });
    expect(url).toBe(
      'https://examplebucket.s3.amazonaws.com/test.txt' +
        '?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
        '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request' +
        '&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host' +
        '&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    );
  });

  it('signs the method, path and response overrides, so none can be swapped', () => {
    const base = { url: 'https://s3.example.test/bucket/a/b', expiresSeconds: 300, now: new Date(0) };
    const sig = (u: string) => new URL(u).searchParams.get('X-Amz-Signature');
    const get = presign(key, { ...base, method: 'GET' });
    expect(sig(presign(key, { ...base, method: 'PUT' }))).not.toBe(sig(get));
    expect(sig(presign(key, { ...base, method: 'GET', url: 'https://s3.example.test/bucket/a/c' }))).not.toBe(
      sig(get),
    );
    const attachment = presign(key, {
      ...base,
      method: 'GET',
      query: { 'response-content-disposition': 'attachment' },
    });
    expect(new URL(attachment).searchParams.get('response-content-disposition')).toBe('attachment');
    expect(sig(attachment)).not.toBe(sig(get));
  });

  it('refuses URLs that already carry a query, credentials or a fragment, and bad expiries', () => {
    const now = new Date(0);
    for (const url of [
      'https://s3.example.test/b/k?x=1',
      'https://u:p@s3.example.test/b/k',
      'https://s3.example.test/b/k#f',
    ])
      expect(() => presign(key, { method: 'GET', url, expiresSeconds: 60, now })).toThrow(
        'presign_invalid_url',
      );
    for (const expiresSeconds of [0, 604801, 1.5])
      expect(() =>
        presign(key, { method: 'GET', url: 'https://s3.example.test/b/k', expiresSeconds, now }),
      ).toThrow('presign_invalid_expiry');
  });
});
