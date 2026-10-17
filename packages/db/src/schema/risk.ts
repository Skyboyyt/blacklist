import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { bl, id, at, optionalAt } from './columns.ts';
import { subjects } from './moderation.ts';

// Phase 10 (ARCHITECTURE §15, data-model §7). Assessments, their inputs and factors and
// signal revisions are append-only; the current pointer moves only forward by sequence.

export const riskRulesets = bl.table(
  'risk_rulesets',
  {
    version: text('version').primaryKey(),
    engineVersion: text('engine_version').notNull(),
    definition: jsonb('definition').notNull(),
    checksum: text('checksum').notNull(),
    activatedAt: at('activated_at'),
    retiredAt: optionalAt('retired_at'),
  },
  (t) => [check('ruleset_checksum_hex', sql`${t.checksum} ~ '^[a-f0-9]{64}$'`)],
);

export const riskSignals = bl.table(
  'risk_signals',
  {
    id: id(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id),
    factorCode: text('factor_code').notNull(),
    tier: text('tier').notNull(),
    provenance: text('provenance').notNull(),
    sourceType: text('source_type').notNull(),
    sourceRef: text('source_ref').notNull(),
    currentRevision: integer('current_revision').notNull(),
    status: text('status').notNull(),
    createdAt: at('created_at'),
  },
  (t) => [
    check('signal_tier_valid', sql`${t.tier} in ('verified','analysis','disclosure','weak')`),
    check(
      'signal_status_valid',
      sql`${t.status} in ('active','expired','retracted','suppressed','suspended','superseded')`,
    ),
    check('signal_source_type_valid', sql`${t.sourceType} in ('finding','chain_analysis')`),
    unique('one_signal_per_source_factor').on(t.sourceType, t.sourceRef, t.factorCode),
  ],
);

export const riskSignalRevisions = bl.table(
  'risk_signal_revisions',
  {
    signalId: uuid('signal_id')
      .notNull()
      .references(() => riskSignals.id),
    revision: integer('revision').notNull(),
    status: text('status').notNull(),
    sourceRevision: text('source_revision').notNull(),
    validUntil: optionalAt('valid_until'),
    independentlyApproved: boolean('independently_approved').notNull(),
    evidenceRefs: jsonb('evidence_refs').notNull(),
    reason: text('reason').notNull(),
    at: at('at'),
  },
  (t) => [
    primaryKey({ columns: [t.signalId, t.revision] }),
    check(
      'signal_revision_status_valid',
      sql`${t.status} in ('active','expired','retracted','suppressed','suspended','superseded')`,
    ),
  ],
);

export const riskAssessments = bl.table(
  'risk_assessments',
  {
    id: id(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id),
    seq: integer('seq').notNull(),
    score: integer('score'),
    band: text('band').notNull(),
    confidence: text('confidence').notNull(),
    ceiling: integer('ceiling').notNull(),
    ceilingApplied: boolean('ceiling_applied').notNull(),
    ceilingReason: text('ceiling_reason'),
    rulesetVersion: text('ruleset_version')
      .notNull()
      .references(() => riskRulesets.version),
    rulesetChecksum: text('ruleset_checksum').notNull(),
    engineVersion: text('engine_version').notNull(),
    evaluationTime: timestamp('evaluation_time', { withTimezone: true }).notNull(),
    effectiveInputsHash: text('effective_inputs_hash').notNull(),
    coverage: jsonb('coverage').notNull(),
    nextReviewAt: optionalAt('next_review_at'),
    trigger: text('trigger').notNull(),
    computedAt: at('computed_at'),
  },
  (t) => [
    unique('assessment_subject_seq').on(t.subjectId, t.seq),
    unique('assessment_subject_id').on(t.subjectId, t.id),
    check('assessment_score_range', sql`${t.score} is null or ${t.score} between 0 and 100`),
    check('assessment_band_valid', sql`${t.band} in ('low','moderate','high','severe','not_assessed')`),
    // A missing score is "not assessed", never 0, and only a scored result has a band.
    check('assessment_score_band', sql`(${t.score} is null) = (${t.band} = 'not_assessed')`),
    check('assessment_confidence_valid', sql`${t.confidence} in ('low','medium','high')`),
    check(
      'assessment_trigger_valid',
      sql`${t.trigger} in ('signal_change','expiry','ruleset','manual_replay')`,
    ),
  ],
);

export const riskAssessmentInputs = bl.table(
  'risk_assessment_inputs',
  {
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => riskAssessments.id),
    signalId: uuid('signal_id')
      .notNull()
      .references(() => riskSignals.id),
    signalRevision: integer('signal_revision').notNull(),
    factorCode: text('factor_code').notNull(),
    tier: text('tier').notNull(),
    provenance: text('provenance').notNull(),
    statusAtEvaluation: text('status_at_evaluation').notNull(),
    sourceRevision: text('source_revision').notNull(),
    validUntil: optionalAt('valid_until'),
    independentlyApproved: boolean('independently_approved').notNull(),
    evidenceRefs: jsonb('evidence_refs').notNull(),
  },
  (t) => [primaryKey({ columns: [t.assessmentId, t.signalId] })],
);

export const riskAssessmentFactors = bl.table(
  'risk_assessment_factors',
  {
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => riskAssessments.id),
    signalId: uuid('signal_id')
      .notNull()
      .references(() => riskSignals.id),
    contribution: integer('contribution').notNull(),
    applied: boolean('applied').notNull(),
    reason: text('reason'),
    explanationKey: text('explanation_key').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.assessmentId, t.signalId] }),
    check('factor_contribution_range', sql`${t.contribution} between 0 and 100`),
    check('factor_applied_reason', sql`${t.applied} = (${t.reason} is null)`),
  ],
);

export const riskSubjectState = bl.table('risk_subject_state', {
  subjectId: uuid('subject_id')
    .primaryKey()
    .references(() => subjects.id),
  lastSeq: integer('last_seq').notNull().default(0),
  dirty: boolean('dirty').notNull().default(false),
  updatedAt: at('updated_at'),
});

export const currentRiskAssessments = bl.table(
  'current_risk_assessments',
  {
    subjectId: uuid('subject_id')
      .primaryKey()
      .references(() => subjects.id),
    assessmentId: uuid('assessment_id').notNull(),
    seq: integer('seq').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.subjectId, t.assessmentId],
      foreignColumns: [riskAssessments.subjectId, riskAssessments.id],
      name: 'current_assessment_same_subject',
    }),
  ],
);

export const assessmentAnnotations = bl.table(
  'assessment_annotations',
  {
    id: id(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id),
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => riskAssessments.id),
    kind: text('kind').notNull(),
    note: text('note'),
    decisionId: uuid('decision_id'),
    at: at('at'),
  },
  (t) => [
    check('annotation_kind_valid', sql`${t.kind} in ('superseded_by_reversal','finding_suspended','stale')`),
  ],
);

/**
 * Slice 4: an administrator's audited suppression of an analysis factor on one address
 * (signal:suppress, step-up). Its public reason is shown with the assessment. A
 * suppression is lifted, never deleted; findings are suspended or reversed instead.
 */
export const riskSignalSuppressions = bl.table(
  'risk_signal_suppressions',
  {
    id: id(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id),
    factorCode: text('factor_code').notNull(),
    publicReason: text('public_reason').notNull(),
    internalRationale: text('internal_rationale').notNull(),
    stepupChallengeId: uuid('stepup_challenge_id').notNull(),
    createdByRef: text('created_by_ref').notNull(),
    createdAt: at('created_at'),
    liftedAt: optionalAt('lifted_at'),
    liftedByRef: text('lifted_by_ref'),
    liftReason: text('lift_reason'),
    liftStepupChallengeId: uuid('lift_stepup_challenge_id'),
  },
  (t) => [
    check(
      'suppression_factor_valid',
      sql`${t.factorCode} in ('token.symbol_impersonation','eoa.delegated_to_flagged')`,
    ),
    check('suppression_public_reason', sql`char_length(${t.publicReason}) between 10 and 300`),
    check('suppression_rationale', sql`char_length(${t.internalRationale}) between 10 and 2000`),
    check(
      'suppression_lift_complete',
      sql`num_nulls(${t.liftedAt}, ${t.liftedByRef}, ${t.liftReason}, ${t.liftStepupChallengeId}) in (0, 4)`,
    ),
    uniqueIndex('one_active_suppression')
      .on(t.subjectId, t.factorCode)
      .where(sql`${t.liftedAt} is null`),
  ],
);
