import { expect, test } from 'vitest';
import { hashPassword, needsRehash, normalizePassword, verifyPassword } from './password.js';

test('S8: NFKC, Unicode code-point and byte boundaries reject without truncation', () => {
  expect(() => normalizePassword('a'.repeat(7))).toThrow('password_policy_rejected');
  expect(normalizePassword('a'.repeat(8))).toHaveLength(8);
  expect(normalizePassword('a'.repeat(15))).toHaveLength(15);
  expect(normalizePassword('a'.repeat(128))).toHaveLength(128);
  expect(() => normalizePassword('a'.repeat(129))).toThrow('password_policy_rejected');
  expect(Buffer.byteLength(normalizePassword('😀'.repeat(128)))).toBe(512);
  expect(() => normalizePassword('😀'.repeat(128) + 'a')).toThrow('password_policy_rejected');
  expect(normalizePassword('Ａ'.repeat(15))).toBe('A'.repeat(15));
  expect(() => normalizePassword('a'.repeat(15) + '\n')).toThrow('password_policy_rejected');
});
test('S7 primitive: Argon2id verifies normalized passwords and detects stale parameters', async () => {
  const stored = await hashPassword('Ａ'.repeat(15));
  expect(needsRehash(stored)).toBe(false);
  expect(await verifyPassword({ hash: stored, password: 'A'.repeat(15) })).toBe(true);
  expect(await verifyPassword({ hash: stored, password: 'B'.repeat(15) })).toBe(false);
  expect(needsRehash('$argon2id$v=19$m=8192,t=1,p=1$fixture')).toBe(true);
});
