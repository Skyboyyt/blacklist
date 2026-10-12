import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safe-redirect';

describe('safeNextPath (open-redirect protection)', () => {
  it.each([
    ['/reports', '/reports'],
    ['/address/ethereum/0xabc?tab=1#x', '/address/ethereum/0xabc?tab=1#x'],
  ])('accepts same-origin relative path %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    [undefined],
    [''],
    ['https://evil.example/'],
    ['//evil.example'],
    ['/\\evil.example'],
    ['\\\\evil.example'],
    ['javascript:alert(1)'],
    ['reports'],
    ['/\u0000/x'],
    ['/%0a/x\n'],
    ['/login'],
    ['/register/complete'],
    [`/${'a'.repeat(600)}`],
  ])('falls back to the dashboard for %s', (input) => {
    expect(safeNextPath(input)).toBe('/dashboard');
  });
});
