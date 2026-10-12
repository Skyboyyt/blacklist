import { describe, expect, it } from 'vitest';
import {
  checkPasswordLength,
  codePointLength,
  emailSchema,
  handleSchema,
  loginOutcomeSchema,
  loginRequestSchema,
  newPasswordSchema,
  registerCompleteFormSchema,
  resetPasswordOutcomeSchema,
  utf8ByteLength,
} from './auth.ts';

describe('password length rules (identity §3)', () => {
  it('requires at least 15 code points', () => {
    expect(checkPasswordLength('a'.repeat(14))).toBe('too_short');
    expect(checkPasswordLength('a'.repeat(15))).toBeNull();
  });

  it('counts code points, not UTF-16 units', () => {
    const emoji = '🔐'; // 1 code point, 2 UTF-16 units, 4 bytes
    expect(emoji.length).toBe(2);
    expect(codePointLength(emoji.repeat(15))).toBe(15);
    expect(checkPasswordLength(emoji.repeat(14))).toBe('too_short');
    expect(checkPasswordLength(emoji.repeat(15))).toBeNull();
  });

  it('rejects more than 128 code points instead of truncating', () => {
    expect(checkPasswordLength('a'.repeat(128))).toBeNull();
    expect(checkPasswordLength('a'.repeat(129))).toBe('too_long');
  });

  it('rejects more than 512 UTF-8 bytes even within 128 code points', () => {
    const fourByte = '𝄞'; // U+1D11E, 4 bytes
    expect(utf8ByteLength(fourByte.repeat(128))).toBe(512);
    expect(checkPasswordLength(fourByte.repeat(128))).toBeNull();
    expect(checkPasswordLength(`${fourByte.repeat(127)}ab`)).toBe('too_long');
  });

  it('applies NFKC before counting', () => {
    // U+FB01 (ﬁ ligature) normalizes to "fi": 8 ligatures become 16 code points.
    expect(checkPasswordLength('ﬁ'.repeat(8))).toBeNull();
  });

  it('matches TextEncoder byte counts, including lone surrogates', () => {
    for (const sample of ['abc', 'é', '€', '🔐', '\uD800', 'a\uDC00b']) {
      expect(utf8ByteLength(sample)).toBe(new TextEncoder().encode(sample).length);
    }
  });

  it('exposes the rule through the schema with a readable message', () => {
    const result = newPasswordSchema.safeParse('short');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/at least 15/);
  });
});

describe('email schema', () => {
  it('trims and lowercases without provider-specific folding', () => {
    expect(emailSchema.parse('  First.Last+tag@Example.TEST ')).toBe('first.last+tag@example.test');
  });

  it('rejects invalid addresses', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
    expect(emailSchema.safeParse('').success).toBe(false);
  });
});

describe('login request', () => {
  it('does not apply new-password length rules at sign-in (no information about stored passwords)', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@example.test', password: 'x' }).success).toBe(true);
  });

  it('rejects unknown fields', () => {
    expect(
      loginRequestSchema.safeParse({ email: 'a@example.test', password: 'x', remember: true }).success,
    ).toBe(false);
  });

  it('carries an optional, non-empty human-verification response (identity §12)', () => {
    const base = { email: 'a@example.test', password: 'x' };
    expect(loginRequestSchema.safeParse({ ...base, humanVerification: 'opaque' }).success).toBe(true);
    expect(loginRequestSchema.safeParse({ ...base, humanVerification: '' }).success).toBe(false);
    expect(loginRequestSchema.safeParse({ ...base, humanVerification: 'x'.repeat(4097) }).success).toBe(
      false,
    );
  });

  it('has a human-verification outcome that reveals nothing about the account', () => {
    expect(loginOutcomeSchema.parse({ kind: 'human_verification_required' })).toEqual({
      kind: 'human_verification_required',
    });
    expect(
      loginOutcomeSchema.safeParse({ kind: 'human_verification_required', accountExists: true }).success,
    ).toBe(false);
  });
});

describe('password reset outcome (identity §6.3)', () => {
  it('models the staff passkey step', () => {
    expect(resetPasswordOutcomeSchema.parse({ kind: 'passkey_required' }).kind).toBe('passkey_required');
    expect(resetPasswordOutcomeSchema.parse({ kind: 'passkey_not_verified', result: 'cancelled' }).kind).toBe(
      'passkey_not_verified',
    );
  });

  it('cannot report a verified passkey as an unfinished reset', () => {
    expect(
      resetPasswordOutcomeSchema.safeParse({ kind: 'passkey_not_verified', result: 'verified' }).success,
    ).toBe(false);
  });
});

describe('registration completion', () => {
  const valid = {
    handle: 'demo_user',
    password: 'correct horse battery',
    confirmPassword: 'correct horse battery',
  };

  it('accepts a valid form', () => {
    expect(registerCompleteFormSchema.safeParse(valid).success).toBe(true);
  });

  it('reports mismatched confirmation on the confirmation field', () => {
    const result = registerCompleteFormSchema.safeParse({
      ...valid,
      confirmPassword: 'something else entirely',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['confirmPassword']);
  });

  it('validates handles', () => {
    expect(handleSchema.safeParse('ab').success).toBe(false);
    expect(handleSchema.safeParse('Upper').success).toBe(false);
    expect(handleSchema.safeParse('ok_handle_1').success).toBe(true);
  });
});
