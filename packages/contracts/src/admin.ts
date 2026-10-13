/**
 * ADMINISTRATOR DTOs (PRD §5.24; ARCHITECTURE §9.2, §9.4; identity §10; data-model §3,
 * §4, §7). Returned only to administrators in a WebAuthn-assured session. Staff and
 * member emails appear masked; no credentials, tokens or authenticator keys appear.
 *
 * Privilege increases need two different administrators (identity §10.4, §10.8);
 * reductions may be done by one. Consequential actions need an action-bound step-up.
 */
import { z } from './zod.ts';
import { chainSlugSchema, isoDateTimeSchema } from './common.ts';
import { emailSchema } from './auth.ts';
import { staffRefSchema, staffRoleSchema } from './moderation.ts';
import { SUPPRESSIBLE_FACTOR_CODES } from './research.ts';

const rationale = z.string().trim().min(10, 'Write at least 10 characters.').max(2000);

export const staffMemberSchema = z.strictObject({
  id: z.string(),
  handle: z.string(),
  /** Masked, e.g. `m•••@example.test`. */
  emailMasked: z.string(),
  roles: z.array(staffRoleSchema),
  status: z.enum(['active', 'suspended', 'deactivated']),
  /** Enrolled authenticators; fewer than two suspends staff permissions after 7 days (identity §10.10). */
  authenticators: z.number().int().min(0),
  lastActiveAt: isoDateTimeSchema.nullable(),
});
export type StaffMember = z.infer<typeof staffMemberSchema>;

export const invitationSchema = z.strictObject({
  id: z.string(),
  emailMasked: z.string(),
  role: staffRoleSchema,
  /** `pending_approval` until a second administrator approves an admin invitation. */
  state: z.enum(['pending_approval', 'issued', 'accepted', 'revoked', 'expired']),
  invitedBy: staffRefSchema,
  approvedBy: staffRefSchema.nullable(),
  requiresSecondApproval: z.boolean(),
  createdAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
});
export type Invitation = z.infer<typeof invitationSchema>;

export const invitationRequestSchema = z.strictObject({ email: emailSchema, role: staffRoleSchema });
export type InvitationRequest = z.infer<typeof invitationRequestSchema>;

/**
 * The one-time enrollment code is shown once, to the inviter, and must be delivered
 * through a separate, previously verified channel (identity §10.4 split secret).
 */
export const invitationCreatedSchema = z.strictObject({
  invitation: invitationSchema,
  enrollmentCode: z.string(),
});
export type InvitationCreated = z.infer<typeof invitationCreatedSchema>;

export const roleRequestSchema = z.strictObject({
  id: z.string(),
  target: staffRefSchema,
  role: staffRoleSchema,
  action: z.enum(['grant', 'revoke']),
  proposedBy: staffRefSchema,
  approvedBy: staffRefSchema.nullable(),
  state: z.enum(['pending', 'approved', 'cancelled']),
  createdAt: isoDateTimeSchema,
});
export type RoleRequest = z.infer<typeof roleRequestSchema>;

export const roleChangeRequestSchema = z.strictObject({
  targetId: z.string(),
  role: staffRoleSchema,
  action: z.enum(['grant', 'revoke']),
});
export type RoleChangeRequest = z.infer<typeof roleChangeRequestSchema>;

/** Staff recovery after losing all authenticators (identity §10.11). */
export const recoveryCaseSchema = z.strictObject({
  id: z.string(),
  subject: staffRefSchema,
  openedBy: staffRefSchema,
  verifications: z.array(
    z.strictObject({ verifier: staffRefSchema, method: z.string().max(200), at: isoDateTimeSchema }),
  ),
  approvedBy: staffRefSchema.nullable(),
  objectionWindowEndsAt: isoDateTimeSchema.nullable(),
  state: z.enum([
    'verifying',
    'awaiting_approval',
    'objection_window',
    'fresh_enrollment',
    'objected',
    'completed',
    'cancelled',
  ]),
  createdAt: isoDateTimeSchema,
});
export type RecoveryCase = z.infer<typeof recoveryCaseSchema>;
export const recoveryCompletionSchema = recoveryCaseSchema.extend({ enrollmentCode: z.string() });
export type RecoveryCompletion = z.infer<typeof recoveryCompletionSchema>;

export const recoveryVerificationSchema = z.strictObject({
  method: z.string().trim().min(10, 'Describe how and why identity was verified.').max(100),
});

export const memberAccountSchema = z.strictObject({
  id: z.string(),
  handle: z.string(),
  status: z.enum(['active', 'suspended']),
  joinedAt: isoDateTimeSchema,
  openSubmissions: z.number().int().min(0),
  /** Internal reason recorded with the suspension. */
  suspensionReason: z.string().nullable(),
});
export type MemberAccount = z.infer<typeof memberAccountSchema>;

export const reasonRequestSchema = z.strictObject({ reason: rationale });
export type ReasonRequest = z.infer<typeof reasonRequestSchema>;

const labelSubject = z.strictObject({
  chain: chainSlugSchema,
  address: z.string(),
  displayAddress: z.string(),
});

export const adminLabelSchema = z.strictObject({
  id: z.string(),
  subject: labelSubject,
  text: z.string(),
  provenance: z.enum(['moderator_finding', 'external_source']),
  sourceName: z.string().nullable(),
  basisNote: z.string(),
  status: z.enum(['active', 'retired']),
  createdBy: staffRefSchema,
  createdAt: isoDateTimeSchema,
  retiredAt: isoDateTimeSchema.nullable(),
});
export type AdminLabel = z.infer<typeof adminLabelSchema>;

export const labelRequestSchema = z
  .strictObject({
    chain: chainSlugSchema,
    address: z.string().trim().min(1, 'Enter an address.'),
    text: z.string().trim().min(3, 'Use at least 3 characters.').max(60, 'Use at most 60 characters.'),
    provenance: z.enum(['moderator_finding', 'external_source']),
    sourceName: z.string().trim().max(80).optional(),
    basisNote: z.string().trim().min(10, 'Explain the basis in at least 10 characters.').max(300),
  })
  .refine((v) => v.provenance !== 'external_source' || (v.sourceName ?? '').length > 0, {
    path: ['sourceName'],
    message: 'Name the external source.',
  });
export type LabelRequest = z.infer<typeof labelRequestSchema>;

export const suppressionSchema = z.strictObject({
  id: z.string(),
  subject: labelSubject,
  factorCode: z.enum(SUPPRESSIBLE_FACTOR_CODES),
  publicReason: z.string(),
  internalRationale: z.string(),
  createdBy: staffRefSchema,
  createdAt: isoDateTimeSchema,
  liftedAt: isoDateTimeSchema.nullable(),
  liftedBy: staffRefSchema.nullable(),
});
export type Suppression = z.infer<typeof suppressionSchema>;

export const suppressionRequestSchema = z.strictObject({
  chain: chainSlugSchema,
  address: z.string().trim().min(1, 'Enter an address.'),
  factorCode: z.enum(SUPPRESSIBLE_FACTOR_CODES),
  publicReason: z.string().trim().min(10, 'Write at least 10 characters.').max(300),
  internalRationale: rationale,
});
export type SuppressionRequest = z.infer<typeof suppressionRequestSchema>;

export const adminOverviewSchema = z.strictObject({
  activeStaff: z.number().int().min(0),
  pendingInvitations: z.number().int().min(0),
  pendingRoleRequests: z.number().int().min(0),
  openRecoveryCases: z.number().int().min(0),
  suspendedMembers: z.number().int().min(0),
  activeLabels: z.number().int().min(0),
  activeSuppressions: z.number().int().min(0),
  /** Alerts every administrator must see, e.g. a severe finding was suspended (moderation §8.3). */
  alerts: z.array(z.strictObject({ id: z.string(), at: isoDateTimeSchema, text: z.string() })),
});
export type AdminOverview = z.infer<typeof adminOverviewSchema>;
