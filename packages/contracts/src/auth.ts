/**
 * Authentication request schemas (docs/design/identity.md §3–§7).
 *
 * These schemas give the browser early, accessible feedback. They are NOT
 * security enforcement: the API re-validates every request with the same rules
 * and is the only authority.
 */
import { z } from './zod.ts';

export const PASSWORD_MIN_CODE_POINTS = 8;
export const PASSWORD_MAX_CODE_POINTS = 128;
export const PASSWORD_MAX_BYTES = 512;

/** NFKC normalization, applied before every length check (identity §3). */
export function normalizePassword(value: string): string {
  return value.normalize('NFKC');
}

export function codePointLength(value: string): number {
  return Array.from(value).length;
}

/** UTF-8 byte length, computed from code points (lone surrogates count as U+FFFD, 3 bytes). */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const cp = char.codePointAt(0) ?? 0;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return bytes;
}

export type PasswordProblem = 'too_short' | 'too_long' | 'too_many_bytes';

/** Returns the first rule the (normalized) password breaks, or null. Never truncates. */
export function checkPasswordLength(raw: string): PasswordProblem | null {
  const value = normalizePassword(raw);
  const points = codePointLength(value);
  if (points < PASSWORD_MIN_CODE_POINTS) return 'too_short';
  if (points > PASSWORD_MAX_CODE_POINTS) return 'too_long';
  if (utf8ByteLength(value) > PASSWORD_MAX_BYTES) return 'too_many_bytes';
  return null;
}

export const PASSWORD_PROBLEM_MESSAGES: Readonly<Record<PasswordProblem, string>> = {
  too_short: `Use at least ${PASSWORD_MIN_CODE_POINTS} characters.`,
  too_long: `Use at most ${PASSWORD_MAX_CODE_POINTS} characters.`,
  too_many_bytes: 'This password is too long. Use fewer special characters or a shorter passphrase.',
};

/** New-password rule (registration, reset, change). */
export const newPasswordSchema = z.string().superRefine((value, ctx) => {
  const problem = checkPasswordLength(value);
  if (problem) ctx.addIssue({ code: 'custom', message: PASSWORD_PROBLEM_MESSAGES[problem] });
});

/** Sign-in only checks presence: length rules must not reveal anything about stored passwords. */
export const currentPasswordSchema = z.string().min(1, 'Enter your password.');

/** Emails are trimmed and lowercased; no provider-specific dot or plus folding (identity §3). */
export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Enter your email address.')
  .max(254, 'Email addresses can be at most 254 characters.')
  .pipe(z.email({ message: 'Enter a valid email address.' }))
  .transform((value) => value.toLowerCase());

/**
 * Public handle. Interim rule for the UI (the identity design does not fix the
 * character set yet; the API decides): 3–30 characters, lowercase letters,
 * digits and underscores.
 */
export const handleSchema = z
  .string()
  .trim()
  .min(3, 'Use at least 3 characters.')
  .max(30, 'Use at most 30 characters.')
  .regex(/^[a-z0-9_]+$/, 'Use lowercase letters, numbers and underscores only.');

/**
 * Opaque response from the human-verification widget (identity §12, `HumanVerifier`
 * port; provider decision O-6). Single use and verified only by the API. It is not a
 * credential, but it is still never logged or stored.
 */
export const humanVerificationResponseSchema = z.string().min(1).max(4096);

export const loginRequestSchema = z.strictObject({
  email: emailSchema,
  password: currentPasswordSchema,
  /** Present only when retrying after `human_verification_required`. */
  humanVerification: humanVerificationResponseSchema.optional(),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** Email-only request (registration start, password recovery). Same shape, same generic answer. */
export const emailOnlyRequestSchema = z.strictObject({ email: emailSchema });

export const registerStartRequestSchema = emailOnlyRequestSchema;
export type RegisterStartRequest = z.infer<typeof registerStartRequestSchema>;

export const registerCompleteFormSchema = z
  .strictObject({
    handle: handleSchema,
    password: newPasswordSchema,
    confirmPassword: z.string().min(1, 'Confirm your password.'),
  })
  .refine((v) => normalizePassword(v.password) === normalizePassword(v.confirmPassword), {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });
export type RegisterCompleteForm = z.infer<typeof registerCompleteFormSchema>;

export const forgotPasswordRequestSchema = emailOnlyRequestSchema;
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

export const resetPasswordFormSchema = z
  .strictObject({
    password: newPasswordSchema,
    confirmPassword: z.string().min(1, 'Confirm your password.'),
  })
  .refine((v) => normalizePassword(v.password) === normalizePassword(v.confirmPassword), {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });
export type ResetPasswordForm = z.infer<typeof resetPasswordFormSchema>;

/** Token pages: the token arrives in the URL fragment and is only ever POSTed. */
export const flowTokenSchema = z
  .string()
  .min(16)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/);

/** Outcomes the auth UI can show. Messages stay generic to avoid account enumeration. */
export const loginOutcomeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('signed_in'), redirectTo: z.string() }),
  z.strictObject({ kind: z.literal('invalid_credentials') }),
  z.strictObject({ kind: z.literal('rate_limited'), retryAfterSeconds: z.number().int().positive() }),
  z.strictObject({ kind: z.literal('staff_verification_required') }),
  /**
   * Throttling escalated (identity §12): nothing was checked yet. Retry the same request
   * with a fresh `humanVerification` response. It says nothing about the account.
   */
  z.strictObject({ kind: z.literal('human_verification_required') }),
  z.strictObject({ kind: z.literal('temporarily_unavailable') }),
  z.strictObject({ kind: z.literal('unexpected_error'), requestId: z.string() }),
]);
export type LoginOutcome = z.infer<typeof loginOutcomeSchema>;

/**
 * Link (token) states the UI can explain. `superseded`: a newer link was requested,
 * so only the newest email works (identity §4.2, §8.4). Redemption failures from the
 * API stay generic; these states only choose helpful copy.
 */
export const tokenStatusSchema = z.enum(['valid', 'invalid', 'expired', 'used', 'superseded']);
export type TokenStatus = z.infer<typeof tokenStatusSchema>;

export const tokenFlowOutcomeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('success') }),
  z.strictObject({ kind: z.literal('token_problem'), status: tokenStatusSchema.exclude(['valid']) }),
  z.strictObject({ kind: z.literal('handle_unavailable') }),
  z.strictObject({ kind: z.literal('password_rejected'), reason: z.enum(['policy', 'breached']) }),
  z.strictObject({ kind: z.literal('rate_limited'), retryAfterSeconds: z.number().int().positive() }),
  z.strictObject({ kind: z.literal('temporarily_unavailable') }),
  z.strictObject({ kind: z.literal('unexpected_error'), requestId: z.string() }),
]);
export type TokenFlowOutcome = z.infer<typeof tokenFlowOutcomeSchema>;

/** Passkey outcomes that leave a staff reset unfinished (the browser may retry). */
export const resetPasskeyProblemSchema = z.enum(['cancelled', 'timed_out', 'unsupported', 'failed']);
export type ResetPasskeyProblem = z.infer<typeof resetPasskeyProblemSchema>;

/**
 * Password reset redemption (identity §6.3). A staff account's reset also needs a
 * WebAuthn assertion whose challenge is bound to the reset token:
 *
 *   submit(token, password) ──► passkey_required ──► submit with passkey ──► success
 *                                                          └──► passkey_not_verified (retry)
 *
 * `passkey_required` and `passkey_not_verified` change nothing: the token stays usable
 * and no password, session or cooling state moves until the assertion verifies.
 */
export const resetPasswordOutcomeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('password_rejected'), reason: z.enum(['policy', 'breached']) }),
  z.strictObject({ kind: z.literal('success') }),
  z.strictObject({ kind: z.literal('token_problem'), status: tokenStatusSchema.exclude(['valid']) }),
  z.strictObject({ kind: z.literal('passkey_required') }),
  z.strictObject({ kind: z.literal('passkey_not_verified'), result: resetPasskeyProblemSchema }),
  z.strictObject({ kind: z.literal('rate_limited'), retryAfterSeconds: z.number().int().positive() }),
  z.strictObject({ kind: z.literal('temporarily_unavailable') }),
  z.strictObject({ kind: z.literal('unexpected_error'), requestId: z.string() }),
]);
export type ResetPasswordOutcome = z.infer<typeof resetPasswordOutcomeSchema>;

/** "If an account exists, we sent instructions" — always the same response. */
export const emailAcceptedOutcomeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('accepted') }),
  z.strictObject({ kind: z.literal('rate_limited'), retryAfterSeconds: z.number().int().positive() }),
  z.strictObject({ kind: z.literal('temporarily_unavailable') }),
  z.strictObject({ kind: z.literal('unexpected_error'), requestId: z.string() }),
]);
export type EmailAcceptedOutcome = z.infer<typeof emailAcceptedOutcomeSchema>;
