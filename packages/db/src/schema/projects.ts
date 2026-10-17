import { sql } from 'drizzle-orm';
import { check, integer, jsonb, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { bl, id, at, optionalAt } from './columns.ts';
import { user } from './auth.ts';
import { subjects } from './moderation.ts';

// Phase 10 slice 3: staff project profiles (data-model §4), member suggestions (ADR 0010
// Part A) and profile corrections. Profile revisions are append-only; an attribution is a
// basis with time and evidence, never an ownership verdict.

const CATEGORY = sql.raw(`('defi','exchange','wallet','token','nft','infrastructure','dao','other')`);
const BASIS = sql.raw(
  `('official_announcement','deployment_record','authority_signature','staff_documentary_review')`,
);
const REASONS = sql.raw(
  `('insufficient_evidence','out_of_scope','duplicate','not_reproducible','already_corrected')`,
);

export const projects = bl.table(
  'projects',
  {
    id: id(),
    subjectId: uuid('subject_id')
      .notNull()
      .unique()
      .references(() => subjects.id),
    slug: text('slug').notNull().unique(),
    currentRevision: integer('current_revision').notNull(),
    createdAt: at('created_at'),
  },
  (t) => [
    check(
      'project_slug_format',
      sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(${t.slug}) between 2 and 64`,
    ),
  ],
);

export const projectRevisions = bl.table(
  'project_revisions',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    revisionNumber: integer('revision_number').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    description: text('description').notNull(),
    authorRef: text('author_ref').notNull(),
    sourceCaseId: uuid('source_case_id'),
    publicNote: text('public_note').notNull(),
    createdAt: at('created_at'),
  },
  (t) => [
    unique('project_revision_number').on(t.projectId, t.revisionNumber),
    check('project_revision_name', sql`char_length(${t.name}) between 1 and 80`),
    check('project_revision_category', sql`${t.category} in ${CATEGORY}`),
    check('project_revision_description', sql`char_length(${t.description}) <= 2000`),
  ],
);

export const projectAddresses = bl.table(
  'project_addresses',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    addressSubjectId: uuid('address_subject_id')
      .notNull()
      .references(() => subjects.id),
    role: text('role').notNull(),
    basis: text('basis').notNull(),
    basisNote: text('basis_note').notNull(),
    attributedAt: at('attributed_at'),
    retiredAt: optionalAt('retired_at'),
  },
  (t) => [
    check(
      'project_address_role',
      sql`${t.role} in ('token','contract','program','treasury','deployer','other')`,
    ),
    check('project_address_basis', sql`${t.basis} in ${BASIS}`),
    check('project_address_note', sql`char_length(${t.basisNote}) between 1 and 300`),
    uniqueIndex('one_active_project_address')
      .on(t.projectId, t.addressSubjectId)
      .where(sql`${t.retiredAt} is null`),
  ],
);

export const projectDomains = bl.table(
  'project_domains',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    hostname: text('hostname').notNull(),
    basis: text('basis').notNull(),
    basisNote: text('basis_note').notNull(),
    attributedAt: at('attributed_at'),
    retiredAt: optionalAt('retired_at'),
  },
  (t) => [
    check(
      'project_domain_hostname',
      sql`${t.hostname} ~ '^([a-z0-9-]+\\.)+[a-z0-9-]+$' and char_length(${t.hostname}) <= 253`,
    ),
    check('project_domain_basis', sql`${t.basis} in ${BASIS}`),
    check('project_domain_note', sql`char_length(${t.basisNote}) between 1 and 300`),
    uniqueIndex('one_active_project_domain')
      .on(t.projectId, t.hostname)
      .where(sql`${t.retiredAt} is null`),
  ],
);

export const projectSuggestions = bl.table(
  'project_suggestions',
  {
    id: id(),
    submitterUserId: uuid('submitter_user_id')
      .notNull()
      .references(() => user.id),
    name: text('name').notNull(),
    category: text('category').notNull(),
    chainId: text('chain_id').notNull(),
    identifier: text('identifier').notNull(),
    /** Defanged link text; never fetched. */
    linksText: jsonb('links_text').notNull(),
    description: text('description').notNull(),
    relationship: text('relationship').notNull(),
    status: text('status').notNull(),
    submitterReason: text('submitter_reason'),
    resultingProjectId: uuid('resulting_project_id').references(() => projects.id),
    submittedAt: at('submitted_at'),
    decidedAt: optionalAt('decided_at'),
  },
  (t) => [
    check(
      'suggestion_status_valid',
      sql`${t.status} in ('submitted','needs_information','accepted_into_profile','not_accepted','withdrawn')`,
    ),
    check('suggestion_category_valid', sql`${t.category} in ${CATEGORY}`),
    check('suggestion_reason_valid', sql`${t.submitterReason} is null or ${t.submitterReason} in ${REASONS}`),
    check('suggestion_name_length', sql`char_length(${t.name}) between 2 and 80`),
    check(
      'suggestion_result',
      sql`(${t.status} = 'accepted_into_profile') = (${t.resultingProjectId} is not null)`,
    ),
  ],
);

export const correctionRequests = bl.table(
  'correction_requests',
  {
    id: id(),
    requesterUserId: uuid('requester_user_id')
      .notNull()
      .references(() => user.id),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    /** The profile revision the requester saw; acceptance checks it is still current. */
    baseRevision: integer('base_revision').notNull(),
    statement: text('statement').notNull(),
    proposedDescription: text('proposed_description'),
    addDomain: text('add_domain'),
    retireDomain: text('retire_domain'),
    status: text('status').notNull(),
    submitterReason: text('submitter_reason'),
    submittedAt: at('submitted_at'),
    decidedAt: optionalAt('decided_at'),
  },
  (t) => [
    check(
      'correction_status_valid',
      sql`${t.status} in ('submitted','in_review','accepted','rejected','withdrawn')`,
    ),
    check('correction_reason_valid', sql`${t.submitterReason} is null or ${t.submitterReason} in ${REASONS}`),
    check(
      'correction_has_change',
      sql`num_nonnulls(${t.proposedDescription}, ${t.addDomain}, ${t.retireDomain}) >= 1`,
    ),
    check('correction_statement_length', sql`char_length(${t.statement}) between 10 and 5000`),
  ],
);
