/**
 * STAFF security DTOs (identity design §10). Returned only to the staff account
 * holder in a WebAuthn-assured session. Narrow by design: no moderation, case or
 * role-administration data (those arrive with the staff UI in Phase 5).
 *
 * The frontend never verifies credentials: passkey results here are what the
 * future API reports after it verifies an assertion.
 */
import { z } from './zod.ts';
import { flowTokenSchema, newPasswordSchema } from './auth.ts';
import { isoDateTimeSchema } from './common.ts';

/** Staff need at least two registered authenticators (identity §10.1). */
export const STAFF_MIN_AUTHENTICATORS = 2;

export const staffAuthenticatorSchema = z.strictObject({
  /** Opaque handle, not the credential ID. */
  id: z.string(),
  label: z.string().max(60),
  kind: z.enum(['security_key', 'platform_passkey']),
  /** Backup-eligible/synced credential: may share fate with another synced one. */
  synced: z.boolean(),
  registeredAt: isoDateTimeSchema,
  lastUsedAt: isoDateTimeSchema.nullable(),
});
export type StaffAuthenticator = z.infer<typeof staffAuthenticatorSchema>;

export const staffSecuritySchema = z.strictObject({
  role: z.enum(['moderator', 'admin', 'appeal_reviewer']),
  authenticators: z.array(staffAuthenticatorSchema),
  /** Set when fewer than two authenticators are registered (permissions suspend after 7 days). */
  authenticatorDeficitSince: isoDateTimeSchema.nullable(),
});
export type StaffSecurity = z.infer<typeof staffSecuritySchema>;

/** Outcome of a WebAuthn ceremony as reported to the UI. */
export const passkeyResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('verified') }),
  z.strictObject({ kind: z.literal('cancelled') }),
  z.strictObject({ kind: z.literal('timed_out') }),
  z.strictObject({ kind: z.literal('unsupported') }),
  z.strictObject({ kind: z.literal('failed') }),
  z.strictObject({ kind: z.literal('session_expired') }),
]);
export type PasskeyResult = z.infer<typeof passkeyResultSchema>;

/** Step 1 of enrollment: emailed token + out-of-band enrollment code (identity §10.4). */
export const ENROLLMENT_CODE_LENGTH = 10;

export const enrollmentStartSchema = z.strictObject({
  token: flowTokenSchema,
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase().replace(/[\s-]/g, ''))
    .pipe(
      z
        .string()
        .length(ENROLLMENT_CODE_LENGTH, `The enrollment code has ${ENROLLMENT_CODE_LENGTH} characters.`)
        .regex(/^[A-Z0-9]+$/, 'Use the letters and numbers from the code you were given.'),
    ),
});
export type EnrollmentStart = z.infer<typeof enrollmentStartSchema>;

export const enrollmentStartResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ok'), role: z.enum(['moderator', 'admin', 'appeal_reviewer']) }),
  z.strictObject({
    kind: z.literal('invitation_problem'),
    status: z.enum(['invalid', 'expired', 'used', 'superseded', 'revoked']),
  }),
  z.strictObject({ kind: z.literal('code_incorrect'), attemptsRemaining: z.number().int().min(0) }),
  z.strictObject({ kind: z.literal('rate_limited'), retryAfterSeconds: z.number().int().positive() }),
  z.strictObject({ kind: z.literal('temporarily_unavailable') }),
]);
export type EnrollmentStartResult = z.infer<typeof enrollmentStartResultSchema>;

/**
 * Step 2 of enrollment (identity §10.5): the chosen password, sent once to the bound
 * server-side enrollment flow. The API keeps only its hash in the enrollment draft;
 * activation (step 5) fails unless the flow holds a password and two authenticators.
 * The confirmation field stays in the browser.
 */
export const enrollmentPasswordRequestSchema = z.strictObject({ password: newPasswordSchema });
export type EnrollmentPasswordRequest = z.infer<typeof enrollmentPasswordRequestSchema>;

/** Staff recovery stages (identity §10.11). No stage bypasses WebAuthn. */
export const recoveryStageSchema = z.enum([
  'requested',
  'identity_verification',
  'second_admin_approval',
  'objection_window',
  'fresh_enrollment',
  'completed',
  'rejected',
  'cancelled',
]);
export type RecoveryStage = z.infer<typeof recoveryStageSchema>;

/** What the recovering staff member sees about their own case. No reviewer identities. */
export const staffRecoveryStatusSchema = z.strictObject({
  stage: recoveryStageSchema,
  openedAt: isoDateTimeSchema,
  /** End of the 24-hour objection window, when it is running. */
  objectionWindowEndsAt: isoDateTimeSchema.nullable(),
  /** Two staff members verify identity; this counts completed verifications only. */
  identityVerificationsCompleted: z.number().int().min(0).max(2),
});
export type StaffRecoveryStatus = z.infer<typeof staffRecoveryStatusSchema>;
