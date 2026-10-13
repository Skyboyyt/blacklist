import { integer, text, uuid } from 'drizzle-orm/pg-core';
import { bl, id, at, optionalAt } from './columns.ts';
import { user, session } from './auth.ts';
// A short-lived, immutable password-hash draft lets step-up bind a credential
// change by ID without putting a fast digest of a password in action_hash.
export const credentialIntents = bl.table('staff_credential_change_intents', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => session.id, { onDelete: 'cascade' }),
  securityVersion: integer('security_version').notNull(),
  passwordHash: text('password_hash').notNull(),
  expiresAt: at('expires_at'),
  consumedAt: optionalAt('consumed_at'),
  createdAt: at('created_at'),
});
