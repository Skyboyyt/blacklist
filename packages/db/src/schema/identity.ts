import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, integer, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { bl, id, at, optionalAt } from './columns.ts';
import { user, session } from './auth.ts';

export const profiles = bl.table(
  'user_profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => user.id),
    handle: text('handle').notNull().unique(),
    displayName: text('display_name'),
    createdAt: at('created_at'),
    updatedAt: at('updated_at'),
  },
  (t) => [check('handle_valid', sql`${t.handle} ~ '^[a-z0-9_]{3,30}$'`)],
);
export const security = bl.table(
  'account_security_state',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => user.id),
    securityVersion: integer('security_version').notNull().default(1),
    lastResetGeneration: integer('last_reset_generation').notNull().default(0),
    sensitiveActionsLockedUntil: optionalAt('sensitive_actions_locked_until'),
    passwordChangedAt: optionalAt('password_changed_at'),
    deactivatedAt: optionalAt('deactivated_at'),
    staffRecoveryPending: boolean('staff_recovery_pending').notNull().default(false),
    staffAuthenticatorDeficitSince: optionalAt('staff_authenticator_deficit_since'),
    suspensionReason: text('suspension_reason'),
  },
  (t) => [check('security_version_positive', sql`${t.securityVersion} > 0`)],
);
export const policy = bl.table(
  'session_policy_state',
  {
    sessionId: uuid('session_id').primaryKey(),
    userId: uuid('user_id').notNull(),
    accountKind: text('account_kind').notNull(),
    securityVersion: integer('security_version').notNull(),
    createdAt: at('created_at'),
    lastActivityAt: at('last_activity_at'),
    reauthenticatedAt: optionalAt('reauthenticated_at'),
    ipPrefix: text('ip_prefix'),
    userAgentSummary: text('user_agent_summary'),
  },
  (t) => [
    foreignKey({
      name: 'policy_owner',
      columns: [t.sessionId, t.userId],
      foreignColumns: [session.id, session.userId],
    }).onDelete('cascade'),
  ],
);
export const intents = bl.table(
  'registration_intents',
  {
    id: id(),
    email: text('email').notNull(),
    state: text('state').notNull(),
    generation: integer('generation').notNull().default(0),
    deliveryOutcome: text('delivery_outcome'),
    closeReason: text('close_reason'),
    tokenHash: text('token_hash').unique(),
    issuedAt: optionalAt('issued_at'),
    expiresAt: optionalAt('expires_at'),
    completedAt: optionalAt('completed_at'),
    supersededAt: optionalAt('superseded_at'),
    requestedIpPrefix: text('requested_ip_prefix'),
    createdAt: at('created_at'),
  },
  (t) => [
    uniqueIndex('one_open_registration')
      .on(t.email)
      .where(sql`${t.state} in ('requested','pending_delivery','issued')`),
    check(
      'registration_state_valid',
      sql`${t.state} in ('requested','pending_delivery','issued','completed','superseded','expired')`,
    ),
  ],
);
export const tokens = bl.table(
  'identity_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    purpose: text('purpose').notNull(),
    targetEmail: text('target_email'),
    requestId: uuid('request_id').notNull(),
    generation: integer('generation').notNull(),
    securityVersion: integer('security_version').notNull(),
    state: text('state').notNull(),
    invalidationReason: text('invalidation_reason'),
    tokenHash: text('token_hash').notNull().unique(),
    issuedAt: at('issued_at'),
    expiresAt: at('expires_at'),
    activatedAt: optionalAt('activated_at'),
    consumedAt: optionalAt('consumed_at'),
    terminalAt: optionalAt('terminal_at'),
  },
  (t) => [
    uniqueIndex('one_open_identity_token')
      .on(t.userId, t.purpose)
      .where(sql`${t.state} in ('pending_delivery','active')`),
    check('token_purpose_valid', sql`${t.purpose} in ('password_reset','email_change')`),
    check(
      'token_state_valid',
      sql`${t.state} in ('pending_delivery','active','consumed','invalidated','expired')`,
    ),
  ],
);
export const resetRequests = bl.table('password_reset_requests', {
  id: id(),
  email: text('email').notNull(),
  requestedAt: at('requested_at'),
  requestedIpPrefix: text('requested_ip_prefix'),
  processedAt: optionalAt('processed_at'),
  outcome: text('outcome'),
});
export const emailRequests = bl.table('email_change_requests', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id),
  newEmail: text('new_email').notNull(),
  securityVersion: integer('security_version').notNull(),
  requestedAt: at('requested_at'),
  requestedIpPrefix: text('requested_ip_prefix'),
  oldEmail: text('old_email').notNull(),
  processedAt: optionalAt('processed_at'),
  outcome: text('outcome'),
});
export const deliveries = bl.table(
  'security_email_deliveries',
  {
    id: id(),
    kind: text('kind').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    generation: integer('generation').notNull(),
    outcome: text('outcome').notNull(),
    providerMessageId: text('provider_message_id'),
    sanitizedErrorCode: text('sanitized_error_code'),
    providerStatus: integer('provider_status'),
    attemptedAt: at('attempted_at'),
  },
  (t) => [
    check(
      'delivery_outcome_valid',
      sql`${t.outcome} in ('accepted_for_delivery','retryable_failure','permanent_failure')`,
    ),
  ],
);
export const throttle = bl.table('auth_throttle', {
  key: text('key').primaryKey(),
  failures: integer('failures').notNull().default(0),
  windowStartedAt: at('window_started_at'),
  nextAllowedAt: optionalAt('next_allowed_at'),
  challengeRequired: boolean('challenge_required').notNull().default(false),
  attempts: integer('attempts').notNull().default(0),
  updatedAt: at('updated_at'),
});
