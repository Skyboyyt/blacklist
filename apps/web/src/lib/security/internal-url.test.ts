import { describe, expect, it } from 'vitest';
import { allowedInternalUrl } from './internal-url';

describe('internal API URL transport', () => {
  it('requires HTTPS except for loopback development hosts', () => {
    for (const ok of [
      'https://api.example.test',
      'http://localhost:4107',
      'http://127.0.0.1:4107',
      'http://[::1]:4107',
    ])
      expect(allowedInternalUrl(new URL(ok))).toBe(true);
    for (const bad of [
      'http://api.example.test',
      'http://10.0.0.5:4107',
      'https://user:secret@api.example.test',
      'ftp://api.example.test',
    ])
      expect(allowedInternalUrl(new URL(bad))).toBe(false);
  });
});
