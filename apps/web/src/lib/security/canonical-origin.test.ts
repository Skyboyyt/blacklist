import { describe, expect, it } from 'vitest';
import { canonicalRedirectUrl } from './canonical-origin';

const target = 'https://canonical.example.test';
describe('configured canonical frontend origin', () => {
  it('redirects legacy token-page paths without putting a fragment in the Location', () => {
    const location = canonicalRedirectUrl(
      new URL('https://legacy.example.test/register/complete'),
      target,
      'GET',
    );
    expect(location?.href).toBe(target + '/register/complete');
    expect(location?.hash).toBe('');
    // A Location without a fragment lets the browser inherit the original fragment.
  });
  it('cannot turn a caller path/query into an open redirect', () => {
    const location = canonicalRedirectUrl(
      new URL('https://legacy.example.test//foreign.example/path?next=https://foreign.example'),
      target,
      'HEAD',
    );
    expect(location?.origin).toBe(target);
    expect(location?.pathname).toBe('//foreign.example/path');
  });
  it('leaves configured-host requests, API traffic, mutations and local unset workflows unchanged', () => {
    expect(canonicalRedirectUrl(new URL(target + '/register'), target, 'GET')).toBeNull();
    for (const path of ['/api', '/api/v1/auth/register/start', '/_next/static/chunk.js'])
      expect(canonicalRedirectUrl(new URL('https://legacy.example.test' + path), target, 'GET')).toBeNull();
    expect(canonicalRedirectUrl(new URL('https://legacy.example.test/register'), target, 'POST')).toBeNull();
    expect(canonicalRedirectUrl(new URL('http://localhost:3000/register'), undefined, 'GET')).toBeNull();
  });
  it('rejects malformed deployment settings with a generic error', () => {
    for (const setting of [
      'http://canonical.example.test',
      'https://secret:secret@canonical.example.test',
      target + '/path',
      target + '?token=fictional',
      target + '#fictional',
      'invalid',
    ])
      expect(() =>
        canonicalRedirectUrl(new URL('https://legacy.example.test/register'), setting, 'GET'),
      ).toThrow('Invalid CANONICAL_APP_ORIGIN');
  });
});
