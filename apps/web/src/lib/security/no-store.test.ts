import { describe, expect, it } from 'vitest';
import { matchesPrefix, NO_STORE_PREFIXES, TOKEN_PAGE_PREFIXES } from './csp';

describe('sensitive page header scope', () => {
  it.each([
    '/login',
    '/reset-password',
    '/register/complete',
    '/staff/enroll',
    '/staff/verify',
    '/settings/security/sessions',
    '/dashboard',
    '/mod/approvals',
  ])('%s is never cached', (path) => {
    expect(matchesPrefix(path, NO_STORE_PREFIXES)).toBe(true);
  });

  it('token pages are a subset of no-store pages', () => {
    for (const p of TOKEN_PAGE_PREFIXES) expect(matchesPrefix(p, NO_STORE_PREFIXES)).toBe(true);
  });

  it('does not match look-alike prefixes', () => {
    expect(matchesPrefix('/loginx', NO_STORE_PREFIXES)).toBe(false);
    expect(matchesPrefix('/staffing', NO_STORE_PREFIXES)).toBe(false);
  });
});
