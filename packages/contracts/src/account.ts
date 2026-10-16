/**
 * MEMBER-PRIVATE account and security DTOs (identity design §5–§9; PRD §6.1).
 *
 * Returned only to the signed-in account holder; never part of public research.
 * They carry no session tokens, secrets or internal user IDs: session `id` is an
 * opaque per-session handle for revocation only (E-1 mitigation M6), and device
 * information is a coarse summary (PRD §6.1 data minimization: no IPs or locations).
 */
import { z } from './zod.ts';
import { emailSchema, memberPasswordSchema, normalizePassword } from './auth.ts';
import { isoDateTimeSchema } from './common.ts';

/** Error codes the account/security UI can explain. Raw backend messages are never shown. */
export const accountErrorCodeSchema = z.enum([
  'invalid_credentials',
  'current_password_incorrect',
  'rate_limited',
  'session_expired',
  'reauth_required',
  'cooling_period',
  'temporarily_unavailable',
  'session_not_found',
  'cannot_revoke_current_session',
  /** Staff enrollment activation before the bound flow has a password and two authenticators. */
  'enrollment_incomplete',
  /** The new password failed the length/character policy or the common-password check. */
  'password_policy_rejected',
  /** The new password appears in a known breach corpus. */
  'password_breached',
]);
export type AccountErrorCode = z.infer<typeof accountErrorCodeSchema>;

export const accountErrorSchema = z.strictObject({
  kind: z.literal('error'),
  code: accountErrorCodeSchema,
  /** Seconds until a retry may succeed, when the server knows it. */
  retryAfterSeconds: z.number().int().positive().optional(),
  /** End of a cooling period, when relevant. */
  until: isoDateTimeSchema.optional(),
});
export type AccountError = z.infer<typeof accountErrorSchema>;

const ok = z.strictObject({ kind: z.literal('ok') });

/** Generic result of an account action: success or a typed error. */
export const accountActionResultSchema = z.discriminatedUnion('kind', [ok, accountErrorSchema]);
export type AccountActionResult = z.infer<typeof accountActionResultSchema>;

export const sessionSummarySchema = z.strictObject({
  /** Opaque handle for revocation. Never the session token. */
  id: z.string().min(8).max(64),
  current: z.boolean(),
  /** Coarse device summary, e.g. "Firefox on Windows". */
  deviceSummary: z.string().max(80),
  createdAt: isoDateTimeSchema,
  lastActiveAt: isoDateTimeSchema,
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

/** Account security events shown to their owner (audit kinds in identity §10.14, simplified). */
export const securityEventKindSchema = z.enum([
  'signed_in',
  'password_changed',
  'password_reset',
  'email_change_requested',
  'email_changed',
  'session_revoked',
  'other_sessions_revoked',
  'staff_authenticator_registered',
  'staff_authenticator_removed',
  'staff_recovery_completed',
]);
export type SecurityEventKind = z.infer<typeof securityEventKindSchema>;

export const securityEventSchema = z.strictObject({
  id: z.string(),
  kind: securityEventKindSchema,
  at: isoDateTimeSchema,
  deviceSummary: z.string().max(80).nullable(),
});
export type SecurityEvent = z.infer<typeof securityEventSchema>;

/** Active cooling period after a password reset (identity §9: 72 hours; blocks email change in V1). */
export const coolingPeriodSchema = z.strictObject({
  reason: z.literal('password_reset'),
  until: isoDateTimeSchema,
});
export type CoolingPeriod = z.infer<typeof coolingPeriodSchema>;

export const accountSecuritySchema = z.strictObject({
  accountKind: z.enum(['member', 'staff']),
  handle: z.string(),
  /** The holder's own email, shown only to them. */
  email: z.string(),
  passwordChangedAt: isoDateTimeSchema.nullable(),
  cooling: coolingPeriodSchema.nullable(),
  /** End of the current re-authentication window (10 minutes), if any. */
  reauthValidUntil: isoDateTimeSchema.nullable(),
  sessions: z.array(sessionSummarySchema).min(1),
  recentEvents: z.array(securityEventSchema),
});
export type AccountSecurity = z.infer<typeof accountSecuritySchema>;

export const accountSecurityResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ok'), data: accountSecuritySchema }),
  accountErrorSchema,
]);
export type AccountSecurityResult = z.infer<typeof accountSecurityResultSchema>;

export const reauthRequestSchema = z.strictObject({ password: z.string().min(1, 'Enter your password.') });
export type ReauthRequest = z.infer<typeof reauthRequestSchema>;

export const passwordChangeFormSchema = z
  .strictObject({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: memberPasswordSchema,
    confirmPassword: z.string().min(1, 'Confirm your new password.'),
  })
  .refine((v) => normalizePassword(v.newPassword) === normalizePassword(v.confirmPassword), {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  })
  .refine((v) => normalizePassword(v.newPassword) !== normalizePassword(v.currentPassword), {
    path: ['newPassword'],
    message: 'Choose a password different from your current one.',
  });
export type PasswordChangeForm = z.infer<typeof passwordChangeFormSchema>;

export const emailChangeRequestSchema = z.strictObject({ newEmail: emailSchema });
export type EmailChangeRequest = z.infer<typeof emailChangeRequestSchema>;

/** The minimal private profile (PRD §5.3): handle and display name. Not public in V1. */
export const profileSchema = z.strictObject({
  handle: z.string(),
  displayName: z.string().max(50).nullable(),
  updatedAt: isoDateTimeSchema,
});
export type Profile = z.infer<typeof profileSchema>;

/** Only the display name can be changed in V1; the handle is fixed at registration. */
export const profileUpdateSchema = z.strictObject({
  displayName: z
    .string()
    .trim()
    .max(50, 'Use at most 50 characters.')
    .refine((v) => !/[<>]/.test(v), 'Angle brackets are not allowed.'),
});
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
