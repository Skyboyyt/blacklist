import { relations, sql } from 'drizzle-orm';
import { boolean, check, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { bl, id, at } from './columns.ts';
export const user = bl.table(
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
export const session = bl.table(
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
export const account = bl.table(
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
export const verification = bl.table('auth_verifications', {
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
