import { sql } from 'drizzle-orm';
import { check, index, integer, text, unique, uuid } from 'drizzle-orm/pg-core';
import { bl, id, at, optionalAt } from './columns.ts';
import { evidenceItems } from './moderation.ts';

// Phase 9b image evidence (data-model §5, ADR 0004, ADR 0020). Each item owns its own
// objects; nothing is shared across items, and a hash is never an access key.

/** Stored bytes of an item: the quarantined upload and the immutable original. */
export const evidenceObjects = bl.table(
  'evidence_objects',
  {
    id: id(),
    evidenceItemId: uuid('evidence_item_id')
      .notNull()
      .references(() => evidenceItems.id),
    role: text('role').notNull(),
    bucket: text('bucket').notNull(),
    storageKey: text('storage_key').notNull().unique(),
    objectVersionId: text('object_version_id'),
    sha256: text('sha256').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: at('created_at'),
    purgedAt: optionalAt('purged_at'),
    purgeReason: text('purge_reason'),
  },
  (t) => [
    unique('evidence_object_role').on(t.evidenceItemId, t.role),
    check('evidence_object_role_valid', sql`${t.role} in ('quarantine','original')`),
    check('evidence_object_sha256', sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
    check('evidence_object_size', sql`${t.sizeBytes} between 1 and 10485760`),
    check('evidence_object_purge', sql`(${t.purgedAt} is null) = (${t.purgeReason} is null)`),
  ],
);

/** Sanitized images made by the isolated processor; the only bytes any UI shows. */
export const evidenceDerivatives = bl.table(
  'evidence_derivatives',
  {
    id: id(),
    evidenceItemId: uuid('evidence_item_id')
      .notNull()
      .references(() => evidenceItems.id),
    kind: text('kind').notNull(),
    bucket: text('bucket').notNull(),
    storageKey: text('storage_key').notNull().unique(),
    sha256: text('sha256').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    format: text('format').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    processorVersion: text('processor_version').notNull(),
    createdByRef: text('created_by_ref').notNull(),
    createdAt: at('created_at'),
    purgedAt: optionalAt('purged_at'),
  },
  (t) => [
    index('evidence_derivatives_item').on(t.evidenceItemId),
    check('evidence_derivative_kind_valid', sql`${t.kind} in ('sanitized_image','redacted')`),
    check('evidence_derivative_format_valid', sql`${t.format} in ('png','jpeg','webp')`),
    check('evidence_derivative_sha256', sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
    check(
      'evidence_derivative_dimensions',
      sql`${t.width} between 1 and 12000 and ${t.height} between 1 and 12000 and ${t.sizeBytes} > 0`,
    ),
  ],
);
