import { schema, eq, and, sql, desc, inArray, lte, type Database } from '@blacklist/db';
import { assess, type Assessment, type RiskInput, type SignalStatus } from './engine.ts';
import { V1_RULESET, rulesetChecksum, type RulesetDefinition } from './ruleset.ts';

// Persistence for the risk engine (ARCHITECTURE §15.4–§15.5, data-model §7). Signals follow
// published findings in the same transaction as the moderation change, and the subject is
// recomputed there too, so the public result never lags a publication, suspension or
// reversal. A recompute always reads the current signals: a delayed or repeated call
// cannot bring back an older result (stale-job protocol), and the current pointer only
// moves forward by sequence.

export type RiskTrigger = 'signal_change' | 'expiry' | 'ruleset' | 'manual_replay';
const ACTIVE_RULESET: RulesetDefinition = V1_RULESET;
/**
 * Analysis signals exist only when two providers confirmed their facts (ADR 0021), so a
 * subject with none is still "not assessed" rather than verified-and-clean.
 */
const COVERAGE = { findingsReviewed: true, chainFactsVerified: false } as const;

async function ensureRuleset(tx: Database, ruleset: RulesetDefinition) {
  await tx
    .insert(schema.riskRulesets)
    .values({
      version: ruleset.version,
      engineVersion: ruleset.engineVersion,
      definition: ruleset,
      checksum: rulesetChecksum(ruleset),
    })
    .onConflictDoNothing();
}

const FINDING_SIGNAL: Readonly<Record<string, SignalStatus>> = {
  published: 'active',
  suspended: 'suspended',
  reversed: 'retracted',
};

/**
 * Brings the finding's risk signals in line with its public state: one active signal for
 * the published revision's severity; signals for earlier severities are superseded.
 * Each change appends a signal revision. Returns whether anything changed.
 */
async function syncFindingSignals(tx: Database, findingId: string, reason: string) {
  const [f] = await tx.select().from(schema.findings).where(eq(schema.findings.id, findingId));
  if (!f) throw new Error('finding_missing');
  const status = FINDING_SIGNAL[f.status];
  const [revision] = f.publishedRevisionId
    ? await tx
        .select()
        .from(schema.findingRevisions)
        .where(eq(schema.findingRevisions.id, f.publishedRevisionId))
    : [];
  const signals = await tx
    .select()
    .from(schema.riskSignals)
    .where(and(eq(schema.riskSignals.sourceType, 'finding'), eq(schema.riskSignals.sourceRef, f.id)))
    .for('update');
  const desired = status && revision ? `finding.${revision.severity}` : null;
  const sourceRevision = revision ? `${revision.id}@${f.statusRevision}` : 'none';
  // Publication of a severe revision required an independent approver (moderation §4.1).
  const independentlyApproved = revision?.severity === 'severe';
  let changed = false;
  const write = async (
    signal: typeof schema.riskSignals.$inferSelect,
    next: SignalStatus,
    approved: boolean,
  ) => {
    const [last] = await tx
      .select()
      .from(schema.riskSignalRevisions)
      .where(
        and(
          eq(schema.riskSignalRevisions.signalId, signal.id),
          eq(schema.riskSignalRevisions.revision, signal.currentRevision),
        ),
      );
    if (last && last.status === next && last.sourceRevision === sourceRevision) return;
    const rev = signal.currentRevision + 1;
    await tx.insert(schema.riskSignalRevisions).values({
      signalId: signal.id,
      revision: rev,
      status: next,
      sourceRevision,
      independentlyApproved: approved,
      evidenceRefs: [f.id],
      reason,
    });
    await tx
      .update(schema.riskSignals)
      .set({ currentRevision: rev, status: next })
      .where(eq(schema.riskSignals.id, signal.id));
    changed = true;
  };
  for (const signal of signals)
    await write(
      signal,
      signal.factorCode === desired && status ? status : 'superseded',
      independentlyApproved,
    );
  if (desired && status && !signals.some((s) => s.factorCode === desired)) {
    const [created] = await tx
      .insert(schema.riskSignals)
      .values({
        subjectId: f.subjectId,
        factorCode: desired,
        tier: 'verified',
        provenance: 'moderator_finding',
        sourceType: 'finding',
        sourceRef: f.id,
        currentRevision: 0,
        status,
      })
      .returning();
    if (!created) throw new Error('signal_creation_failed');
    await write(created, status, independentlyApproved);
  }
  return { subjectId: f.subjectId, changed };
}

/**
 * Appends a revision that moves analysis signals on a subject between `active` and
 * `suppressed` (slice 4 suppressions). Returns the signals changed. Findings never take
 * this path: they are suspended or reversed instead.
 */
export async function setAnalysisSignalStatus(
  tx: Database,
  subjectId: string,
  factorCode: string,
  from: SignalStatus,
  to: SignalStatus,
  sourceRevision: string,
  reason: string,
) {
  const signals = await tx
    .select()
    .from(schema.riskSignals)
    .where(
      and(
        eq(schema.riskSignals.subjectId, subjectId),
        eq(schema.riskSignals.factorCode, factorCode),
        eq(schema.riskSignals.sourceType, 'chain_analysis'),
        eq(schema.riskSignals.status, from),
      ),
    )
    .for('update');
  for (const signal of signals) {
    const rev = signal.currentRevision + 1;
    const [last] = await tx
      .select()
      .from(schema.riskSignalRevisions)
      .where(
        and(
          eq(schema.riskSignalRevisions.signalId, signal.id),
          eq(schema.riskSignalRevisions.revision, signal.currentRevision),
        ),
      );
    await tx.insert(schema.riskSignalRevisions).values({
      signalId: signal.id,
      revision: rev,
      status: to,
      sourceRevision,
      validUntil: last?.validUntil ?? null,
      independentlyApproved: false,
      evidenceRefs: last?.evidenceRefs ?? [],
      reason,
    });
    await tx
      .update(schema.riskSignals)
      .set({ currentRevision: rev, status: to })
      .where(eq(schema.riskSignals.id, signal.id));
  }
  return signals.length;
}

async function currentInputs(tx: Database, subjectId: string) {
  const rows = await tx
    .select({ s: schema.riskSignals, r: schema.riskSignalRevisions })
    .from(schema.riskSignals)
    .innerJoin(
      schema.riskSignalRevisions,
      and(
        eq(schema.riskSignalRevisions.signalId, schema.riskSignals.id),
        eq(schema.riskSignalRevisions.revision, schema.riskSignals.currentRevision),
      ),
    )
    .where(eq(schema.riskSignals.subjectId, subjectId));
  return rows.map(({ s, r }): RiskInput => ({
    signalId: s.id,
    signalRevision: r.revision,
    factorCode: s.factorCode,
    tier: s.tier as RiskInput['tier'],
    provenance: s.provenance,
    status: r.status as SignalStatus,
    sourceRevision: r.sourceRevision,
    validUntil: r.validUntil?.toISOString() ?? null,
    evidenceRefs: r.evidenceRefs as string[],
    independentlyApproved: r.independentlyApproved,
  }));
}

/**
 * Recomputes a subject from its current signals. Persists a new assessment only when the
 * effective inputs changed, and advances the current pointer by compare-and-set.
 */
export async function recomputeSubject(
  tx: Database,
  subjectId: string,
  trigger: RiskTrigger,
  now = new Date(),
) {
  await ensureRuleset(tx, ACTIVE_RULESET);
  await tx.insert(schema.riskSubjectState).values({ subjectId }).onConflictDoNothing();
  const [state] = await tx
    .select()
    .from(schema.riskSubjectState)
    .where(eq(schema.riskSubjectState.subjectId, subjectId))
    .for('update');
  if (!state) throw new Error('risk_state_missing');
  const inputs = await currentInputs(tx, subjectId);
  const result = assess(inputs, COVERAGE, ACTIVE_RULESET, now.toISOString());
  const [current] = await tx
    .select({ a: schema.riskAssessments })
    .from(schema.currentRiskAssessments)
    .innerJoin(
      schema.riskAssessments,
      eq(schema.riskAssessments.id, schema.currentRiskAssessments.assessmentId),
    )
    .where(eq(schema.currentRiskAssessments.subjectId, subjectId));
  if (current?.a.effectiveInputsHash === result.effectiveInputsHash) {
    await tx
      .update(schema.riskSubjectState)
      .set({ dirty: false, updatedAt: now })
      .where(eq(schema.riskSubjectState.subjectId, subjectId));
    return { assessmentId: current.a.id, seq: current.a.seq, created: false };
  }
  const seq = state.lastSeq + 1;
  const [row] = await tx
    .insert(schema.riskAssessments)
    .values({
      subjectId,
      seq,
      score: result.score,
      band: result.band,
      confidence: result.confidence,
      ceiling: result.ceiling,
      ceilingApplied: result.ceilingApplied,
      ceilingReason: result.ceilingReason,
      rulesetVersion: result.rulesetVersion,
      rulesetChecksum: result.rulesetChecksum,
      engineVersion: result.engineVersion,
      evaluationTime: new Date(result.evaluationTime),
      effectiveInputsHash: result.effectiveInputsHash,
      coverage: result.coverage,
      nextReviewAt: result.nextReviewAt ? new Date(result.nextReviewAt) : null,
      trigger,
    })
    .returning();
  if (!row) throw new Error('assessment_creation_failed');
  for (const input of inputs)
    await tx.insert(schema.riskAssessmentInputs).values({
      assessmentId: row.id,
      signalId: input.signalId,
      signalRevision: input.signalRevision,
      factorCode: input.factorCode,
      tier: input.tier,
      provenance: input.provenance,
      statusAtEvaluation: input.status,
      sourceRevision: input.sourceRevision,
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
      independentlyApproved: input.independentlyApproved === true,
      evidenceRefs: input.evidenceRefs,
    });
  for (const f of result.factors)
    await tx.insert(schema.riskAssessmentFactors).values({
      assessmentId: row.id,
      signalId: f.signalId,
      contribution: f.contribution,
      applied: f.applied,
      reason: f.reason,
      explanationKey: f.explanationKey,
    });
  // Compare-and-set: the pointer only ever moves to a higher sequence.
  await tx
    .insert(schema.currentRiskAssessments)
    .values({ subjectId, assessmentId: row.id, seq })
    .onConflictDoUpdate({
      target: schema.currentRiskAssessments.subjectId,
      set: { assessmentId: row.id, seq },
      setWhere: sql`${schema.currentRiskAssessments.seq} < ${seq}`,
    });
  await tx
    .update(schema.riskSubjectState)
    .set({ lastSeq: seq, dirty: false, updatedAt: now })
    .where(eq(schema.riskSubjectState.subjectId, subjectId));
  return { assessmentId: row.id, seq, created: true };
}

/**
 * Called whenever a finding's public state changes (publication, new revision, suspension,
 * reinstatement, reversal), inside the same transaction. Suspension and reversal also
 * annotate the assessment that was current, which is never edited (§15.7).
 */
export async function onFindingChanged(
  tx: Database,
  findingId: string,
  reason: string,
  link: { decisionId?: string | undefined; toStatus?: string | undefined } = {},
) {
  const { subjectId, changed } = await syncFindingSignals(tx, findingId, reason);
  if (!changed) return;
  const kind =
    link.toStatus === 'suspended'
      ? 'finding_suspended'
      : link.toStatus === 'reversed'
        ? 'superseded_by_reversal'
        : null;
  if (kind) {
    const [current] = await tx
      .select()
      .from(schema.currentRiskAssessments)
      .where(eq(schema.currentRiskAssessments.subjectId, subjectId));
    if (current)
      await tx.insert(schema.assessmentAnnotations).values({
        subjectId,
        assessmentId: current.assessmentId,
        kind,
        note:
          kind === 'finding_suspended'
            ? 'A finding was suspended pending review.'
            : 'A finding was reversed.',
        decisionId: link.decisionId ?? null,
      });
  }
  await recomputeSubject(tx, subjectId, 'signal_change');
}

/** The current assessment of a subject with its factors, or null when never assessed. */
export async function currentAssessment(db: Database, subjectId: string) {
  const [row] = await db
    .select({ a: schema.riskAssessments })
    .from(schema.currentRiskAssessments)
    .innerJoin(
      schema.riskAssessments,
      eq(schema.riskAssessments.id, schema.currentRiskAssessments.assessmentId),
    )
    .where(eq(schema.currentRiskAssessments.subjectId, subjectId));
  if (!row) return null;
  const factors = await db
    .select({ f: schema.riskAssessmentFactors, i: schema.riskAssessmentInputs })
    .from(schema.riskAssessmentFactors)
    .innerJoin(
      schema.riskAssessmentInputs,
      and(
        eq(schema.riskAssessmentInputs.assessmentId, schema.riskAssessmentFactors.assessmentId),
        eq(schema.riskAssessmentInputs.signalId, schema.riskAssessmentFactors.signalId),
      ),
    )
    .where(eq(schema.riskAssessmentFactors.assessmentId, row.a.id));
  return { assessment: row.a, factors };
}

/** Subjects whose next review time has passed (`risk.expiry_sweep`, §15.5). */
export async function dueForReview(db: Database, now = new Date(), limit = 100) {
  const rows = await db
    .select({ subjectId: schema.riskAssessments.subjectId })
    .from(schema.currentRiskAssessments)
    .innerJoin(
      schema.riskAssessments,
      eq(schema.riskAssessments.id, schema.currentRiskAssessments.assessmentId),
    )
    .where(lte(schema.riskAssessments.nextReviewAt, now))
    .limit(limit);
  return rows.map((r) => r.subjectId);
}

/**
 * `risk.expiry_sweep` (§15.5): recomputes subjects whose next review time has passed,
 * independent of page views. Each subject in its own transaction; returns the count.
 */
export async function sweepDueAssessments(
  runtime: { db: Database; transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> },
  now = new Date(),
) {
  const due = await dueForReview(runtime.db, now);
  for (const subjectId of due)
    await runtime.transaction((tx) => recomputeSubject(tx, subjectId, 'expiry', now));
  return due.length;
}

/** Stored history for replay tests and staff views, newest first. */
export async function assessmentHistory(db: Database, subjectId: string) {
  return db
    .select()
    .from(schema.riskAssessments)
    .where(eq(schema.riskAssessments.subjectId, subjectId))
    .orderBy(desc(schema.riskAssessments.seq));
}

/** Stored inputs of assessments, for replay (§15.4). */
export async function storedInputs(db: Database, assessmentIds: readonly string[]) {
  if (!assessmentIds.length) return [];
  return db
    .select()
    .from(schema.riskAssessmentInputs)
    .where(inArray(schema.riskAssessmentInputs.assessmentId, [...assessmentIds]));
}

export type { Assessment };
