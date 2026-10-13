import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// Acceptance fixtures only. Do not apply these tables to an application database.
export const gate = pgSchema('gate');
const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const at = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();

export const user = gate.table(
  'auth_users',
  {
    id: id(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull(),
    image: text('image'),
    accountKind: text('account_kind').notNull().default('member'),
    status: text('status').notNull().default('active'),
    createdAt: at('created_at'),
    updatedAt: at('updated_at'),
  },
  (t) => [
    check('account_kind_valid', sql`${t.accountKind} in ('member', 'staff')`),
    check('account_status_valid', sql`${t.status} in ('active', 'suspended', 'deactivated')`),
    check('email_verified_at_creation', sql`${t.emailVerified}`),
  ],
);
export const session = gate.table(
  'auth_sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: at('created_at'),
    updatedAt: at('updated_at'),
  },
  (t) => [unique('session_owner').on(t.id, t.userId)],
);
export const account = gate.table(
  'auth_accounts',
  {
    id: id(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: at('created_at'),
    updatedAt: at('updated_at'),
  },
  (t) => [unique('credential_identity').on(t.providerId, t.accountId)],
);
export const verification = gate.table('auth_verifications', {
  id: id(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: at('created_at'),
  updatedAt: at('updated_at'),
});
export const userRelations = relations(user, ({ many }) => ({
  accounts: many(account),
  sessions: many(session),
}));
export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));
export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));
export const security = gate.table(
  'account_security_state',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => user.id),
    securityVersion: integer('security_version').notNull().default(1),
    lastResetGeneration: integer('last_reset_generation').notNull().default(0),
    sensitiveActionsLockedUntil: timestamp('sensitive_actions_locked_until', { withTimezone: true }),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
  },
  (t) => [check('security_version_positive', sql`${t.securityVersion} > 0`)],
);
export const policy = gate.table(
  'session_policy_state',
  {
    sessionId: uuid('session_id').primaryKey(),
    userId: uuid('user_id').notNull(),
    accountKind: text('account_kind').notNull(),
    securityVersion: integer('security_version').notNull(),
    createdAt: at('created_at'),
    lastActivityAt: at('last_activity_at'),
  },
  (t) => [
    foreignKey({
      name: 'policy_owner',
      columns: [t.sessionId, t.userId],
      foreignColumns: [session.id, session.userId],
    }).onDelete('cascade'),
  ],
);
export const intents = gate.table(
  'registration_intents',
  {
    id: id(),
    email: text('email').notNull(),
    state: text('state').notNull(),
    tokenHash: text('token_hash').unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: at('created_at'),
  },
  (t) => [
    uniqueIndex('one_open_registration')
      .on(t.email)
      .where(sql`${t.state} in ('requested','pending_delivery','issued')`),
  ],
);
export const tokens = gate.table(
  'identity_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    purpose: text('purpose').notNull(),
    requestId: uuid('request_id'),
    state: text('state').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    generation: integer('generation').notNull(),
    securityVersion: integer('security_version').notNull(),
    issuedAt: at('issued_at'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
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
export const deliveries = gate.table('security_email_deliveries', {
  id: id(),
  entityId: uuid('entity_id').notNull(),
  generation: integer('generation').notNull(),
  outcome: text('outcome').notNull(),
  attemptedAt: at('attempted_at'),
});
export const resetRequests = gate.table('password_reset_requests', {
  id: id(),
  email: text('email').notNull(),
  requestedAt: at('requested_at'),
});
export const authenticators = gate.table('staff_authenticators', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id),
  credentialId: text('credential_id').notNull().unique(),
  publicKey: text('public_key').notNull(),
  signCount: integer('sign_count').notNull(),
});
export const challenges = gate.table('staff_webauthn_challenges', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id),
  tokenId: uuid('token_id')
    .notNull()
    .references(() => tokens.id),
  purpose: text('purpose').notNull(),
  challengeHash: text('challenge_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
});
export const audit = gate.table('audit_log', {
  seq: bigint('seq', { mode: 'bigint' }).primaryKey(),
  id: uuid('id')
    .notNull()
    .default(sql`uuidv7()`)
    .unique(),
  occurredAt: at('occurred_at'),
  action: text('action').notNull(),
  targetId: uuid('target_id').notNull(),
  details: jsonb('details').notNull(),
  prevHash: text('prev_hash').notNull(),
  rowHash: text('row_hash').notNull(),
});
// Representative Phase 8–10 relationships, confined to the D4 fixture.
export const subjects = gate.table('subjects', { id: id(), kind: text('kind').notNull() }, (t) => [
  unique('subject_kind_pair').on(t.id, t.kind),
]);
export const addresses = gate.table(
  'addresses',
  { id: uuid('id').primaryKey(), kind: text('kind').notNull().default('address') },
  (t) => [
    check('address_kind', sql`${t.kind} = 'address'`),
    foreignKey({ columns: [t.id, t.kind], foreignColumns: [subjects.id, subjects.kind] }),
  ],
);
export const assessments = gate.table(
  'risk_assessments',
  {
    id: id(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id),
  },
  (t) => [unique('assessment_subject_pair').on(t.subjectId, t.id)],
);
export const currentAssessments = gate.table(
  'current_risk_assessments',
  { subjectId: uuid('subject_id').primaryKey(), assessmentId: uuid('assessment_id').notNull() },
  (t) => [
    foreignKey({
      columns: [t.subjectId, t.assessmentId],
      foreignColumns: [assessments.subjectId, assessments.id],
    }),
  ],
);
