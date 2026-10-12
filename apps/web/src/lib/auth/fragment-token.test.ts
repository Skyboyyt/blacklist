import { describe, expect, it, vi } from 'vitest';
import { parseFragmentToken, takeFragmentToken } from './fragment-token';

describe('parseFragmentToken', () => {
  it('reads a well-formed token from the fragment', () => {
    expect(parseFragmentToken('#token=demo-valid-token-0001')).toEqual({
      kind: 'present',
      token: 'demo-valid-token-0001',
    });
  });

  it('distinguishes missing and malformed tokens', () => {
    expect(parseFragmentToken('')).toEqual({ kind: 'missing' });
    expect(parseFragmentToken('#other=1')).toEqual({ kind: 'missing' });
    expect(parseFragmentToken('#token=short')).toEqual({ kind: 'malformed' });
    expect(parseFragmentToken('#token=has spaces and <tags> in it')).toEqual({ kind: 'malformed' });
  });
});

describe('takeFragmentToken', () => {
  it('strips the fragment with replaceState (no new history entry, no reload)', () => {
    const replaceState = vi.fn();
    const win = {
      location: { hash: '#token=demo-valid-token-0001', pathname: '/reset-password', search: '' },
      history: { state: null, replaceState },
    } as unknown as Window;
    expect(takeFragmentToken(win)).toEqual({ kind: 'present', token: 'demo-valid-token-0001' });
    expect(replaceState).toHaveBeenCalledWith(null, '', '/reset-password');
  });
});
