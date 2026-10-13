import { bigint, jsonb, text, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { bl, id, at, optionalAt } from './columns.ts';
import { user } from './auth.ts';
export const auditLog = bl.table('audit_log', {
  seq: bigint('seq', { mode: 'bigint' }).primaryKey(),
  id: uuid('id')
    .notNull()
    .unique()
    .default(sql`uuidv7()`),
  occurredAt: at('occurred_at'),
  actorType: text('actor_type').notNull(),
  actorRef: text('actor_ref').notNull(),
  actorSessionRef: text('actor_session_ref'),
  actorLabel: text('actor_label'),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  requestId: text('request_id'),
  ipPrefix: text('ip_prefix'),
  details: jsonb('details').notNull(),
  prevHash: text('prev_hash').notNull(),
  rowHash: text('row_hash').notNull(),
});
export const actorMap = bl.table('actor_identity_map', {
  actorRef: text('actor_ref').primaryKey(),
  userId: uuid('user_id')
    .unique()
    .references(() => user.id),
  createdAt: at('created_at'),
  erasedAt: optionalAt('erased_at'),
});
export const securityEvents = bl.table('security_events', {
  id: id(),
  occurredAt: at('occurred_at'),
  userId: uuid('user_id').references(() => user.id),
  eventType: text('event_type').notNull(),
  ipPrefix: text('ip_prefix'),
  userAgentSummary: text('user_agent_summary'),
  details: jsonb('details').notNull(),
});
