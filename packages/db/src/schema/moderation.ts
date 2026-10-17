import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
  timestamp,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { bl, id, at, optionalAt } from './columns.ts';
import { user } from './auth.ts';
import { chains } from './chain-verification.ts';
import { projectSuggestions, correctionRequests } from './projects.ts';

// Phase 9a (docs/data-model.md §4–§6, docs/design/moderation.md). Staff actors are
// stored as pseudonymous actor references (actor_identity_map), as elsewhere in audit.

export const subjects = bl.table(
  'subjects',
  {
    id: id(),
    kind: text('kind').notNull(),
    createdAt: at('created_at'),
  },
  (t) => [
    check('subject_kind_valid', sql`${t.kind} in ('address','project','domain')`),
    unique('subjects_id_kind').on(t.id, t.kind),
  ],
);
export const addresses = bl.table(
  'addresses',
  {
    subjectId: uuid('subject_id').primaryKey(),
    kind: text('kind').notNull().default('address'),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.chainId),
    address: text('address').notNull(),
  },
  (t) => [
    check('address_kind_fixed', sql`${t.kind} = 'address'`),
    foreignKey({ columns: [t.subjectId, t.kind], foreignColumns: [subjects.id, subjects.kind] }),
    unique('addresses_chain_address').on(t.chainId, t.address),
  ],
);
export const domains = bl.table(
  'domains',
  {
    subjectId: uuid('subject_id').primaryKey(),
    kind: text('kind').notNull().default('domain'),
    hostname: text('hostname').notNull().unique(),
    registrableDomain: text('registrable_domain').notNull(),
  },
  (t) => [
    check('domain_kind_fixed', sql`${t.kind} = 'domain'`),
    foreignKey({ columns: [t.subjectId, t.kind], foreignColumns: [subjects.id, subjects.kind] }),
  ],
);

/** Private to the reporter and staff; never in a public DTO (moderation §10). */
export const reports = bl.table(
  'reports',
  {
    id: id(),
    reporterUserId: uuid('reporter_user_id')
      .notNull()
      .references(() => user.id),
    category: text('category').notNull(),
    title: text('title').notNull(),
    narrative: text('narrative').notNull(),
    incidentAt: optionalAt('incident_at'),
    lossAmountRaw: text('loss_amount_raw'),
    lossAsset: text('loss_asset'),
    status: text('status').notNull(),
    revision: integer('revision').notNull().default(1),
    screeningFlags: jsonb('screening_flags').notNull().default({}),
    /** Fixed-list reason shown to the reporter after a rejection (contracts SUBMITTER_REASONS). */
    submitterReason: text('submitter_reason'),
    submittedAt: optionalAt('submitted_at'),
    decidedAt: optionalAt('decided_at'),
    lastActivityAt: at('last_activity_at'),
    createdAt: at('created_at'),
  },
  (t) => [
    check(
      'report_status_valid',
      sql`${t.status} in ('draft','submitted','screening','queued','in_review','needs_info','accepted','rejected','rejected_abusive','withdrawn')`,
    ),
    check('report_title_length', sql`char_length(${t.title}) between 1 and 200`),
    check('report_narrative_length', sql`char_length(${t.narrative}) <= 10000`),
    check('report_revision_positive', sql`${t.revision} >= 1`),
    check(
      'report_submitter_reason_valid',
      sql`${t.submitterReason} is null or ${t.submitterReason} in ('insufficient_evidence','out_of_scope','duplicate','not_reproducible','already_corrected')`,
    ),
    index('reports_by_reporter').on(t.reporterUserId, t.createdAt),
  ],
);
export const reportStatusHistory = bl.table(
  'report_status_history',
  {
    id: id(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => reports.id),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    revision: integer('revision').notNull(),
    actorRef: text('actor_ref').notNull(),
    note: text('note'),
    at: at('at'),
  },
  (t) => [
    check('report_history_note_length', sql`${t.note} is null or char_length(${t.note}) <= 2000`),
    unique('report_history_revision').on(t.reportId, t.revision),
  ],
);
export const reportSubjects = bl.table(
  'report_subjects',
  {
    reportId: uuid('report_id')
      .notNull()
      .references(() => reports.id),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id),
    role: text('role').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.reportId, t.subjectId] }),
    check('report_subject_role_valid', sql`${t.role} in ('primary','related')`),
  ],
);

/** Non-image kinds since Phase 9a; image items since Phase 9b (ADR 0004, ADR 0020). */
export const evidenceItems = bl.table(
  'evidence_items',
  {
    id: id(),
    kind: text('kind').notNull(),
    submittedByUserId: uuid('submitted_by_user_id').references(() => user.id),
    submittedByRef: text('submitted_by_ref').notNull(),
    submittedAt: at('submitted_at'),
    description: text('description'),
    chainId: text('chain_id').references(() => chains.chainId),
    txHash: text('tx_hash'),
    address: text('address'),
    urlText: text('url_text'),
    statementText: text('statement_text'),
    state: text('state').notNull(),
    visibility: text('visibility').notNull().default('staff_only'),
    legalHold: boolean('legal_hold').notNull().default(false),
    /** Images: the declared upload type, processing attempts and the worker's retry time. */
    contentType: text('content_type'),
    processingAttempts: integer('processing_attempts').notNull().default(0),
    nextAttemptAt: optionalAt('next_attempt_at'),
    rejectionReason: text('rejection_reason'),
  },
  (t) => [
    check(
      'evidence_kind_valid',
      sql`${t.kind} in ('image','transaction_ref','address_ref','url','statement')`,
    ),
    check(
      'evidence_state_valid',
      sql`${t.state} in ('upload_pending','quarantined','processing','available','rejected','unpublished','purge_requested','purged')`,
    ),
    check('evidence_visibility_valid', sql`${t.visibility} in ('staff_only','published')`),
    check(
      'evidence_image_columns',
      sql`(${t.kind} = 'image') = (${t.contentType} is not null)
        and (${t.contentType} is null or ${t.contentType} in ('image/png','image/jpeg','image/webp'))`,
    ),
    check(
      'evidence_rejection_reason',
      sql`(${t.state} = 'rejected') = (${t.rejectionReason} is not null) or ${t.kind} <> 'image'`,
    ),
    index('evidence_items_pending').on(t.state, t.nextAttemptAt),
    check(
      'evidence_kind_columns',
      sql`(${t.kind} = 'transaction_ref') = (${t.txHash} is not null)
        and (${t.kind} = 'address_ref') = (${t.address} is not null)
        and (${t.kind} in ('transaction_ref','address_ref')) = (${t.chainId} is not null)
        and (${t.kind} = 'url') = (${t.urlText} is not null)
        and (${t.kind} = 'statement') = (${t.statementText} is not null)`,
    ),
    check(
      'evidence_description_length',
      sql`${t.description} is null or char_length(${t.description}) <= 2000`,
    ),
    check('evidence_url_length', sql`${t.urlText} is null or char_length(${t.urlText}) <= 2048`),
    check(
      'evidence_statement_length',
      sql`${t.statementText} is null or char_length(${t.statementText}) <= 5000`,
    ),
  ],
);

export const moderationCases = bl.table(
  'moderation_cases',
  {
    id: id(),
    caseType: text('case_type').notNull(),
    subjectId: uuid('subject_id').references(() => subjects.id),
    reportId: uuid('report_id').references(() => reports.id),
    findingId: uuid('finding_id').references(() => findings.id),
    appealId: uuid('appeal_id').references((): AnyPgColumn => appeals.id),
    responseId: uuid('response_id').references((): AnyPgColumn => subjectResponses.id),
    suggestionId: uuid('suggestion_id').references((): AnyPgColumn => projectSuggestions.id),
    correctionId: uuid('correction_id').references((): AnyPgColumn => correctionRequests.id),
    status: text('status').notNull(),
    priority: text('priority').notNull().default('normal'),
    assignedToRef: text('assigned_to_ref'),
    version: integer('version').notNull().default(1),
    slaDueAt: optionalAt('sla_due_at'),
    createdAt: at('created_at'),
    closedAt: optionalAt('closed_at'),
  },
  (t) => [
    check(
      'case_type_valid',
      sql`${t.caseType} in ('report_review','appeal_review','correction_request','project_suggestion','subject_response','suspension_review')`,
    ),
    check('case_priority_valid', sql`${t.priority} in ('low','normal','high','urgent')`),
    check('case_report_source', sql`(${t.caseType} = 'report_review') = (${t.reportId} is not null)`),
    check('case_appeal_source', sql`(${t.caseType} = 'appeal_review') = (${t.appealId} is not null)`),
    check('case_response_source', sql`(${t.caseType} = 'subject_response') = (${t.responseId} is not null)`),
    check(
      'case_suggestion_source',
      sql`(${t.caseType} = 'project_suggestion') = (${t.suggestionId} is not null)`,
    ),
    check(
      'case_correction_source',
      sql`(${t.caseType} = 'correction_request') = (${t.correctionId} is not null)`,
    ),
    uniqueIndex('one_case_per_suggestion').on(t.suggestionId),
    uniqueIndex('one_case_per_correction').on(t.correctionId),
    uniqueIndex('one_case_per_report').on(t.reportId),
    uniqueIndex('one_case_per_appeal').on(t.appealId),
    uniqueIndex('one_case_per_response').on(t.responseId),
    index('cases_queue').on(t.status, t.slaDueAt),
  ],
);
export const caseNotes = bl.table(
  'moderation_case_notes',
  {
    id: id(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => moderationCases.id),
    authorRef: text('author_ref').notNull(),
    body: text('body').notNull(),
    at: at('at'),
  },
  (t) => [check('case_note_length', sql`char_length(${t.body}) between 1 and 5000`)],
);
/**
 * Member-visible messages on a case: a staff request for information (`to_submitter`)
 * or the submitter's reply (`from_submitter`). Never internal notes.
 */
export const caseMessages = bl.table(
  'moderation_case_messages',
  {
    id: id(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => moderationCases.id),
    direction: text('direction').notNull(),
    authorRef: text('author_ref').notNull(),
    body: text('body').notNull(),
    at: at('at'),
  },
  (t) => [
    check('case_message_direction', sql`${t.direction} in ('to_submitter','from_submitter')`),
    check('case_message_length', sql`char_length(${t.body}) between 1 and 5000`),
  ],
);

export const findings = bl.table(
  'findings',
  {
    id: id(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id),
    status: text('status').notNull(),
    currentRevisionId: uuid('current_revision_id'),
    publishedRevisionId: uuid('published_revision_id'),
    statusRevision: integer('status_revision').notNull().default(1),
    legalHoldAt: optionalAt('legal_hold_at'),
    createdAt: at('created_at'),
  },
  (t) => [
    check(
      'finding_status_valid',
      sql`${t.status} in ('proposed','pending_second_approval','published','suspended','reversed','superseded','expired')`,
    ),
    check(
      'finding_published_has_revision',
      sql`${t.status} <> 'published' or ${t.publishedRevisionId} is not null`,
    ),
  ],
);
export const findingRevisions = bl.table(
  'finding_revisions',
  {
    id: id(),
    findingId: uuid('finding_id')
      .notNull()
      .references(() => findings.id),
    revisionNumber: integer('revision_number').notNull(),
    authorRef: text('author_ref').notNull(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id),
    findingType: text('finding_type').notNull(),
    severity: text('severity').notNull(),
    publicSummary: text('public_summary').notNull(),
    internalRationale: text('internal_rationale').notNull(),
    evidenceSet: jsonb('evidence_set').notNull(),
    linkedFactorCodes: jsonb('linked_factor_codes').notNull(),
    policyVersion: text('policy_version').notNull(),
    sourceCaseId: uuid('source_case_id').references(() => moderationCases.id),
    contentHash: text('content_hash').notNull(),
    createdAt: at('created_at'),
  },
  (t) => [
    check('revision_severity_valid', sql`${t.severity} in ('low','medium','high','severe')`),
    check('revision_number_positive', sql`${t.revisionNumber} >= 1`),
    check('revision_hash_format', sql`${t.contentHash} ~ '^[0-9a-f]{64}$'`),
    check('revision_summary_length', sql`char_length(${t.publicSummary}) between 1 and 2000`),
    check('revision_rationale_length', sql`char_length(${t.internalRationale}) between 1 and 5000`),
    unique('revision_number_per_finding').on(t.findingId, t.revisionNumber),
    unique('revision_id_finding').on(t.id, t.findingId),
  ],
);
export const findingApprovalEvents = bl.table(
  'finding_approval_events',
  {
    id: id(),
    findingId: uuid('finding_id').notNull(),
    revisionId: uuid('revision_id').notNull(),
    revisionContentHash: text('revision_content_hash').notNull(),
    approverRef: text('approver_ref').notNull(),
    event: text('event').notNull(),
    rationale: text('rationale'),
    publicationBlocked: text('publication_blocked'),
    stepupChallengeId: uuid('stepup_challenge_id').notNull(),
    at: at('at'),
  },
  (t) => [
    foreignKey({
      columns: [t.revisionId, t.findingId],
      foreignColumns: [findingRevisions.id, findingRevisions.findingId],
    }),
    check('approval_event_valid', sql`${t.event} in ('approve','reject','withdraw')`),
    check(
      'approval_rationale_required',
      sql`${t.event} = 'approve' or coalesce(char_length(${t.rationale}), 0) between 10 and 2000`,
    ),
    check(
      'approval_blocked_valid',
      sql`${t.publicationBlocked} is null or ${t.publicationBlocked} = 'legal_hold'`,
    ),
  ],
);
/** Always a system transition caused by one approval event (moderation §4.2). */
export const findingPublicationEvents = bl.table(
  'finding_publication_events',
  {
    id: id(),
    findingId: uuid('finding_id').notNull(),
    revisionId: uuid('revision_id').notNull(),
    actorType: text('actor_type').notNull().default('system'),
    causeApprovalEventId: uuid('cause_approval_event_id')
      .notNull()
      .unique()
      .references(() => findingApprovalEvents.id),
    supersededRevisionId: uuid('superseded_revision_id').references(() => findingRevisions.id),
    at: at('at'),
  },
  (t) => [
    foreignKey({
      columns: [t.revisionId, t.findingId],
      foreignColumns: [findingRevisions.id, findingRevisions.findingId],
    }),
    check('publication_actor_system', sql`${t.actorType} = 'system'`),
  ],
);
export const moderationDecisions = bl.table(
  'moderation_decisions',
  {
    id: id(),
    caseId: uuid('case_id').references(() => moderationCases.id),
    decisionType: text('decision_type').notNull(),
    findingId: uuid('finding_id').references(() => findings.id),
    revisionId: uuid('revision_id').references(() => findingRevisions.id),
    approvalEventId: uuid('approval_event_id').references(() => findingApprovalEvents.id),
    outcome: text('outcome').notNull(),
    rationaleInternal: text('rationale_internal').notNull(),
    publicSummary: text('public_summary'),
    policyVersion: text('policy_version').notNull(),
    decidedByRef: text('decided_by_ref').notNull(),
    stepupChallengeId: uuid('stepup_challenge_id'),
    supersedesDecisionId: uuid('supersedes_decision_id'),
    decidedAt: at('decided_at'),
  },
  (t) => [
    check(
      'decision_type_valid',
      sql`${t.decisionType} in ('report_outcome','finding_reverse','finding_suspend','finding_reinstate','appeal_outcome','standing_outcome','response_outcome','correction_outcome','evidence_action','label_action','suppression')`,
    ),
    check('decision_rationale_length', sql`char_length(${t.rationaleInternal}) between 1 and 5000`),
    foreignKey({ columns: [t.supersedesDecisionId], foreignColumns: [t.id], name: 'decision_supersedes_fk' }),
  ],
);
export const decisionEvidence = bl.table(
  'decision_evidence',
  {
    decisionId: uuid('decision_id')
      .notNull()
      .references(() => moderationDecisions.id),
    evidenceItemId: uuid('evidence_item_id')
      .notNull()
      .references(() => evidenceItems.id),
  },
  (t) => [primaryKey({ columns: [t.decisionId, t.evidenceItemId] })],
);
export const findingStatusHistory = bl.table(
  'finding_status_history',
  {
    id: id(),
    findingId: uuid('finding_id')
      .notNull()
      .references(() => findings.id),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    statusRevision: integer('status_revision').notNull(),
    decisionId: uuid('decision_id').references(() => moderationDecisions.id),
    publicationEventId: uuid('publication_event_id').references(() => findingPublicationEvents.id),
    publicNote: text('public_note'),
    at: at('at'),
  },
  (t) => [unique('finding_status_revision').on(t.findingId, t.statusRevision)],
);

/** Links evidence to exactly one owner; Phase 9a uses reports and finding revisions. */
export const evidenceLinks = bl.table(
  'evidence_links',
  {
    id: id(),
    evidenceItemId: uuid('evidence_item_id')
      .notNull()
      .references(() => evidenceItems.id),
    reportId: uuid('report_id').references(() => reports.id),
    findingRevisionId: uuid('finding_revision_id').references(() => findingRevisions.id),
    linkedByRef: text('linked_by_ref').notNull(),
    linkedAt: at('linked_at'),
    unlinkedAt: optionalAt('unlinked_at'),
  },
  (t) => [check('evidence_link_one_owner', sql`num_nonnulls(${t.reportId}, ${t.findingRevisionId}) = 1`)],
);
export const evidenceCustodyEvents = bl.table(
  'evidence_custody_events',
  {
    id: id(),
    evidenceItemId: uuid('evidence_item_id')
      .notNull()
      .references(() => evidenceItems.id),
    event: text('event').notNull(),
    actorRef: text('actor_ref').notNull(),
    details: jsonb('details').notNull().default({}),
    at: at('at'),
  },
  (t) => [
    check(
      'custody_event_valid',
      sql`${t.event} in ('submitted','processed','rejected','derivative_link_issued','published','unpublished','redacted','legal_hold_set','legal_hold_released','forensic_export','purged')`,
    ),
  ],
);

export const staffConflicts = bl.table(
  'staff_conflicts',
  {
    id: id(),
    staffRef: text('staff_ref').notNull(),
    subjectId: uuid('subject_id').references(() => subjects.id),
    findingId: uuid('finding_id').references(() => findings.id),
    reason: text('reason').notNull(),
    recordedByRef: text('recorded_by_ref').notNull(),
    createdAt: at('created_at'),
    revokedAt: optionalAt('revoked_at'),
  },
  (t) => [
    check('conflict_scope_one', sql`num_nonnulls(${t.subjectId}, ${t.findingId}) = 1`),
    check('conflict_reason_valid', sql`${t.reason} in ('self_declared','admin_recorded','derived')`),
    index('conflicts_by_staff').on(t.staffRef),
  ],
);

/**
 * Server-built signature challenges (moderation §6.4): single use, bound to the member,
 * session, purpose, target, chain and address, and valid for 10 minutes.
 */
export const standingChallenges = bl.table(
  'standing_challenges',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    sessionId: text('session_id').notNull(),
    purpose: text('purpose').notNull(),
    findingId: uuid('finding_id').references(() => findings.id),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id),
    mechanism: text('mechanism').notNull(),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.chainId),
    address: text('address').notNull(),
    nonce: text('nonce').notNull().unique(),
    message: text('message').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: optionalAt('consumed_at'),
    createdAt: at('created_at'),
  },
  (t) => [
    check('challenge_purpose_valid', sql`${t.purpose} in ('appeal','response')`),
    check('challenge_mechanism_valid', sql`${t.mechanism} in ('signature','authority_signature')`),
    check('challenge_appeal_has_finding', sql`(${t.purpose} = 'appeal') = (${t.findingId} is not null)`),
  ],
);
/** What was proven, per case, and by which mechanism (moderation §6.3). Never a persistent link. */
export const standingClaims = bl.table(
  'standing_claims',
  {
    id: id(),
    claimantUserId: uuid('claimant_user_id')
      .notNull()
      .references(() => user.id),
    mechanism: text('mechanism').notNull(),
    proofRefs: jsonb('proof_refs').notNull(),
    decidedByRef: text('decided_by_ref'),
    outcome: text('outcome').notNull(),
    scopeStatement: text('scope_statement').notNull(),
    decidedAt: optionalAt('decided_at'),
    createdAt: at('created_at'),
  },
  (t) => [
    check(
      'claim_mechanism_valid',
      sql`${t.mechanism} in ('signature','authority_signature','dns_txt','documentary')`,
    ),
    check('claim_outcome_valid', sql`${t.outcome} in ('granted','denied','pending')`),
    check('claim_scope_length', sql`char_length(${t.scopeStatement}) between 1 and 2000`),
  ],
);
export const appeals = bl.table(
  'appeals',
  {
    id: id(),
    findingId: uuid('finding_id')
      .notNull()
      .references(() => findings.id),
    appealedRevisionId: uuid('appealed_revision_id')
      .notNull()
      .references(() => findingRevisions.id),
    appellantUserId: uuid('appellant_user_id')
      .notNull()
      .references(() => user.id),
    standingClaimId: uuid('standing_claim_id')
      .notNull()
      .references(() => standingClaims.id),
    statement: text('statement').notNull(),
    status: text('status').notNull(),
    decisionId: uuid('decision_id').references(() => moderationDecisions.id),
    escalatedAt: optionalAt('escalated_at'),
    submittedAt: at('submitted_at'),
    decidedAt: optionalAt('decided_at'),
  },
  (t) => [
    check(
      'appeal_status_valid',
      sql`${t.status} in ('submitted','in_review','upheld','amended','reversed','withdrawn')`,
    ),
    check('appeal_statement_length', sql`char_length(${t.statement}) between 20 and 5000`),
    uniqueIndex('one_open_appeal_per_member')
      .on(t.findingId, t.appellantUserId)
      .where(sql`${t.status} in ('submitted','in_review')`),
  ],
);
/** Right of reply (moderation §9); statuses per plan interim decision 1. */
export const subjectResponses = bl.table(
  'subject_responses',
  {
    id: id(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => user.id),
    standingClaimId: uuid('standing_claim_id')
      .notNull()
      .references(() => standingClaims.id),
    body: text('body').notNull(),
    status: text('status').notNull(),
    submitterReason: text('submitter_reason'),
    publishedAt: optionalAt('published_at'),
    createdAt: at('created_at'),
  },
  (t) => [
    check(
      'response_status_valid',
      sql`${t.status} in ('submitted','in_review','published','rejected','withdrawn')`,
    ),
    check('response_body_length', sql`char_length(${t.body}) between 20 and 5000`),
    check(
      'response_submitter_reason_valid',
      sql`${t.submitterReason} is null or ${t.submitterReason} in ('insufficient_evidence','out_of_scope','duplicate','not_reproducible','already_corrected')`,
    ),
    check('response_published_at', sql`(${t.status} = 'published') = (${t.publishedAt} is not null)`),
    uniqueIndex('one_open_response_per_member')
      .on(t.subjectId, t.authorUserId)
      .where(sql`${t.status} in ('submitted','in_review')`),
  ],
);
