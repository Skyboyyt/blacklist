import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { bl, id, at, optionalAt } from './columns.ts';
import { user, session } from './auth.ts';
import { tokens } from './identity.ts';

export const invitations = bl.table(
  'staff_invitations',
  {
    id: id(),
    email: text('email').notNull(),
    role: text('role').notNull(),
    basis: text('basis').notNull(),
    invitedByActor: text('invited_by_actor').notNull(),
    requiresSecondApproval: boolean('requires_second_approval').notNull(),
    approvedByActor: text('approved_by_actor'),
    approvedAt: optionalAt('approved_at'),
    state: text('state').notNull(),
    tokenHash: text('token_hash').unique(),
    enrollmentCodeHash: text('enrollment_code_hash').notNull(),
    enrollmentCodeAttempts: integer('enrollment_code_attempts').notNull().default(0),
    generation: integer('generation').notNull().default(0),
    deliveredAt: optionalAt('delivered_at'),
    issuedAt: optionalAt('issued_at'),
    expiresAt: at('expires_at'),
    targetUserId: uuid('target_user_id').references(() => user.id),
    createdAt: at('created_at'),
  },
  (t) => [
    check('invitation_role_valid', sql`${t.role} in ('moderator','admin','appeal_reviewer')`),
    check('invitation_code_attempts_valid', sql`${t.enrollmentCodeAttempts} between 0 and 5`),
    check(
      'invitation_approver_distinct',
      sql`${t.approvedByActor} is null or ${t.approvedByActor} <> ${t.invitedByActor}`,
    ),
    check(
      'invitation_state_valid',
      sql`${t.state} in ('pending_approval','issued','accepted','revoked','expired')`,
    ),
  ],
);
export const enrollmentFlows = bl.table('staff_enrollment_flows', {
  id: id(),
  invitationId: uuid('invitation_id')
    .notNull()
    .references(() => invitations.id),
  flowHash: text('flow_hash').notNull().unique(),
  invitationGeneration: integer('invitation_generation').notNull(),
  passwordHash: text('password_hash'),
  authenticators: jsonb('authenticators')
    .notNull()
    .default(sql`'[]'::jsonb`),
  expiresAt: at('expires_at'),
  consumedAt: optionalAt('consumed_at'),
  createdAt: at('created_at'),
});
export const authenticators = bl.table(
  'staff_authenticators',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    credentialId: text('credential_id').notNull().unique(),
    publicKey: text('public_key').notNull(),
    signCount: integer('sign_count').notNull(),
    transports: jsonb('transports').notNull(),
    aaguid: text('aaguid').notNull(),
    backupEligible: boolean('backup_eligible').notNull(),
    backupState: boolean('backup_state').notNull(),
    label: text('label').notNull(),
    createdAt: at('created_at'),
    lastUsedAt: optionalAt('last_used_at'),
    revokedAt: optionalAt('revoked_at'),
    revokeReason: text('revoke_reason'),
    flaggedAt: optionalAt('flagged_at'),
  },
  (t) => [
    unique('authenticator_owner').on(t.id, t.userId),
    check('sign_count_nonnegative', sql`${t.signCount} >= 0`),
  ],
);
export const challenges = bl.table(
  'staff_webauthn_challenges',
  {
    id: id(),
    userId: uuid('user_id').references(() => user.id),
    invitationId: uuid('invitation_id').references(() => invitations.id),
    flowId: uuid('flow_id').references(() => enrollmentFlows.id),
    sessionId: uuid('session_id').references(() => session.id, { onDelete: 'cascade' }),
    tokenId: uuid('token_id').references(() => tokens.id),
    purpose: text('purpose').notNull(),
    actionHash: text('action_hash'),
    challengeHash: text('challenge_hash').notNull(),
    expiresAt: at('expires_at'),
    consumedAt: optionalAt('consumed_at'),
    createdAt: at('created_at'),
  },
  (t) => [
    check('challenge_purpose_valid', sql`${t.purpose} in ('enroll','login','stepup','reset')`),
    check(
      'challenge_binding_valid',
      sql`(${t.purpose} = 'enroll' and ((${t.flowId} is not null and ${t.invitationId} is not null and ${t.userId} is null) or (${t.flowId} is null and ${t.userId} is not null and ${t.sessionId} is not null))) or (${t.purpose} <> 'enroll' and ${t.userId} is not null)`,
    ),
  ],
);
export const assurance = bl.table(
  'staff_session_assurance',
  {
    sessionId: uuid('session_id').primaryKey(),
    userId: uuid('user_id').notNull(),
    authenticatorId: uuid('authenticator_id').notNull(),
    verifiedAt: at('verified_at'),
  },
  (t) => [
    foreignKey({ columns: [t.sessionId, t.userId], foreignColumns: [session.id, session.userId] }).onDelete(
      'cascade',
    ),
    foreignKey({
      columns: [t.authenticatorId, t.userId],
      foreignColumns: [authenticators.id, authenticators.userId],
    }),
  ],
);
export const roleRequests = bl.table(
  'staff_role_requests',
  {
    id: id(),
    targetUserId: uuid('target_user_id')
      .notNull()
      .references(() => user.id),
    role: text('role').notNull(),
    action: text('action').notNull(),
    proposedBy: text('proposed_by').notNull(),
    approvedBy: text('approved_by'),
    approvalBasis: text('approval_basis'),
    state: text('state').notNull(),
    securityVersion: integer('security_version').notNull(),
    createdAt: at('created_at'),
    approvedAt: optionalAt('approved_at'),
  },
  (t) => [
    check('role_request_distinct', sql`${t.approvedBy} is null or ${t.proposedBy} <> ${t.approvedBy}`),
    check('role_request_role_valid', sql`${t.role} in ('moderator','admin','appeal_reviewer')`),
    check('role_request_action_valid', sql`${t.action} in ('grant','revoke')`),
  ],
);
export const roles = bl.table(
  'user_role_assignments',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    role: text('role').notNull(),
    grantedVia: text('granted_via').notNull(),
    sourceId: uuid('source_id').notNull(),
    grantedAt: at('granted_at'),
    revokedAt: optionalAt('revoked_at'),
    revokeReason: text('revoke_reason'),
  },
  (t) => [
    uniqueIndex('one_active_staff_role')
      .on(t.userId, t.role)
      .where(sql`${t.revokedAt} is null`),
    check('staff_role_valid', sql`${t.role} in ('moderator','admin','appeal_reviewer')`),
  ],
);
export const recoveries = bl.table(
  'staff_recovery_cases',
  {
    id: id(),
    subjectUserId: uuid('subject_user_id')
      .notNull()
      .references(() => user.id),
    openedBy: text('opened_by').notNull(),
    approvedBy: text('approved_by'),
    objectionWindowEndsAt: optionalAt('objection_window_ends_at'),
    state: text('state').notNull(),
    invitationId: uuid('invitation_id').references(() => invitations.id),
    /** ADR 0013 C4: resolving an objection opens a new case that references the objected one. */
    reopensCaseId: uuid('reopens_case_id'),
    createdAt: at('created_at'),
  },
  (t) => [
    check('recovery_approver_distinct', sql`${t.approvedBy} is null or ${t.approvedBy} <> ${t.openedBy}`),
    check('recovery_reopens_other', sql`${t.reopensCaseId} is null or ${t.reopensCaseId} <> ${t.id}`),
    foreignKey({ columns: [t.reopensCaseId], foreignColumns: [t.id], name: 'recovery_reopens_case_fk' }),
    // An objected case stays as history (terminal) and no longer blocks a reopened case.
    uniqueIndex('one_open_recovery')
      .on(t.subjectUserId)
      .where(sql`${t.state} not in ('completed','cancelled','objected')`),
    uniqueIndex('one_reopen_per_case').on(t.reopensCaseId),
  ],
);
/** ADR 0013 C: every objection is kept; withdrawal only stamps `withdrawn_at`. */
export const recoveryObjections = bl.table(
  'staff_recovery_objections',
  {
    id: id(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => recoveries.id),
    objector: text('objector').notNull(),
    objectorKind: text('objector_kind').notNull(),
    reason: text('reason'),
    createdAt: at('created_at'),
    withdrawnAt: optionalAt('withdrawn_at'),
  },
  (t) => [
    check('recovery_objector_kind_valid', sql`${t.objectorKind} in ('staff','subject','operator')`),
    check(
      'recovery_staff_objection_reason',
      sql`${t.objectorKind} = 'subject' or char_length(${t.reason}) between 10 and 1000`,
    ),
    index('recovery_objections_by_objector').on(t.objector, t.createdAt),
  ],
);
/**
 * ADR 0013 C2: the subject's single-use, POST-only objection link. It records an
 * objection (and then, once, its withdrawal) and grants nothing else. Redeemable only
 * after the delivery layer reports `accepted_for_delivery` (identity §8).
 */
export const recoveryObjectionLinks = bl.table(
  'staff_recovery_objection_links',
  {
    id: id(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => recoveries.id),
    tokenHash: text('token_hash').unique(),
    state: text('state').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: at('created_at'),
    usedAt: optionalAt('used_at'),
  },
  (t) => [
    check(
      'recovery_link_state_valid',
      sql`${t.state} in ('pending_delivery','active','objected','withdrawn','invalidated')`,
    ),
    check(
      'recovery_link_hash_state',
      sql`(${t.tokenHash} is null) = (${t.state} in ('invalidated','withdrawn'))`,
    ),
  ],
);
export const recoveryVerifications = bl.table(
  'staff_recovery_verifications',
  {
    id: id(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => recoveries.id),
    verifier: text('verifier').notNull(),
    wasAdmin: boolean('was_admin').notNull(),
    method: text('method').notNull(),
    rationale: text('rationale').notNull(),
    createdAt: at('created_at'),
  },
  (t) => [unique('one_verification_per_actor').on(t.caseId, t.verifier)],
);
export const systemState = bl.table(
  'system_state',
  {
    key: integer('key').primaryKey().default(1),
    staffBootstrapCompletedAt: optionalAt('staff_bootstrap_completed_at'),
  },
  (t) => [check('singleton_system_state', sql`${t.key} = 1`)],
);
