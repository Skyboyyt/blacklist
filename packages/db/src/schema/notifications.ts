import { sql } from 'drizzle-orm';
import { check, jsonb, text, unique, uuid, index } from 'drizzle-orm/pg-core';
import { bl, id, at, optionalAt } from './columns.ts';
import { user } from './auth.ts';

// Phase 10 slice 4 (data-model §8): private in-app notifications. The payload holds IDs and
// fixed template parameters only; text is rendered from the type when read. The dedupe key
// makes each event notify a recipient at most once.

export const notifications = bl.table(
  'notifications',
  {
    id: id(),
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => user.id),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    sourceRef: text('source_ref').notNull(),
    sourceRevision: text('source_revision').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    createdAt: at('created_at'),
    readAt: optionalAt('read_at'),
  },
  (t) => [
    check(
      'notification_type_valid',
      sql`${t.type} in ('submission_received','information_requested','decision_recorded','standing_decided','appeal_escalated')`,
    ),
    unique('one_notification_per_event').on(t.recipientUserId, t.dedupeKey),
    index('notifications_by_recipient').on(t.recipientUserId, t.createdAt),
  ],
);
