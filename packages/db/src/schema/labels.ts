import { sql } from 'drizzle-orm';
import { check, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { bl, id, at, optionalAt } from './columns.ts';
import { subjects } from './moderation.ts';

// Phase 10 slice 4 (data-model §4): public identification labels managed by administrators.
// A label identifies an address; it is never a risk factor. Labels are retired, not deleted.

export const addressLabels = bl.table(
  'address_labels',
  {
    id: id(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id),
    text: text('text').notNull(),
    provenance: text('provenance').notNull(),
    sourceName: text('source_name'),
    basisNote: text('basis_note').notNull(),
    createdByRef: text('created_by_ref').notNull(),
    createdAt: at('created_at'),
    retiredAt: optionalAt('retired_at'),
    retiredByRef: text('retired_by_ref'),
    retireReason: text('retire_reason'),
  },
  (t) => [
    check('label_provenance_valid', sql`${t.provenance} in ('moderator_finding','external_source')`),
    check(
      'label_source_name',
      sql`(${t.provenance} = 'external_source') = (${t.sourceName} is not null) and char_length(coalesce(${t.sourceName}, 'x')) between 1 and 80`,
    ),
    check('label_text_length', sql`char_length(${t.text}) between 3 and 60`),
    check('label_basis_length', sql`char_length(${t.basisNote}) between 10 and 300`),
    check(
      'label_retirement',
      sql`(${t.retiredAt} is null) = (${t.retiredByRef} is null) and (${t.retiredAt} is null) = (${t.retireReason} is null)`,
    ),
    uniqueIndex('one_active_label_text')
      .on(t.subjectId, sql`lower(${t.text})`)
      .where(sql`${t.retiredAt} is null`),
  ],
);
