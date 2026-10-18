import type { Database } from '@blacklist/db';
import { currentAssessment } from './service.ts';
import { publicSuppressions } from './suppressions.ts';
import { bandExplanation, coverageText, factorExplanation, factorWeight } from './explanations.ts';
import { V1_RULESET } from './ruleset.ts';
import type { Band, FactorResult } from './engine.ts';

// Assessment DTOs (ARCHITECTURE §15.6). The public view carries the band and reasons only,
// never a number, and only while public bands are enabled (O-12). Staff see the score.

type Current = NonNullable<Awaited<ReturnType<typeof currentAssessment>>>;

function asResults(current: Current): FactorResult[] {
  return current.factors.map(({ f, i }) => ({
    signalId: f.signalId,
    factorCode: i.factorCode,
    contribution: f.contribution,
    applied: f.applied,
    reason: f.reason as FactorResult['reason'],
    explanationKey: f.explanationKey,
  }));
}

const NOT_ASSESSED = {
  band: 'not_assessed' as const,
  factors: [],
  confidence: 'low' as const,
  rulesetVersion: V1_RULESET.version,
  suppressions: [],
};

/**
 * Public assessment (contracts `publicAssessmentSchema`). With public bands off the page
 * says "not assessed" and why, and no assessment detail leaves the server.
 */
export async function publicAssessment(
  db: Database,
  subjectId: string | null,
  options: {
    publicBands: boolean;
    disputeState: 'none' | 'under_appeal' | 'suspended_pending_review';
    now?: Date;
    /** Already loaded by the caller, to avoid a second read (P10-08). */
    suppressions?: Awaited<ReturnType<typeof publicSuppressions>>['active'];
  },
) {
  const now = (options.now ?? new Date()).toISOString();
  const current = subjectId ? await currentAssessment(db, subjectId) : null;
  if (!options.publicBands || !current)
    return {
      ...NOT_ASSESSED,
      explanation: options.publicBands
        ? bandExplanation({ band: 'not_assessed' })
        : 'Risk bands are being calibrated and are not shown yet. Published findings below are reviewed by moderators.',
      coverage:
        'Published moderator findings, and automatic chain checks confirmed by two independent providers.',
      asOf: now,
      disputeState: options.disputeState,
    };
  const { assessment } = current;
  const results = asResults(current);
  const applied = current.factors.filter(({ f }) => f.applied);
  const weights = new Map(
    results.filter((r) => r.applied).map((r) => [r.signalId, factorWeight(r, results)]),
  );
  return {
    band: assessment.band as Band | 'not_assessed',
    explanation: bandExplanation({ band: assessment.band as Band }),
    factors: applied.map(({ f, i }) => ({
      id: f.signalId,
      code: i.factorCode,
      explanation: factorExplanation(i.factorCode),
      provenance: i.provenance,
      weight: weights.get(f.signalId) ?? 'minor',
      observedAt: assessment.evaluationTime.toISOString(),
    })),
    confidence: assessment.confidence as 'low' | 'medium' | 'high',
    coverage: coverageText({
      coverage: assessment.coverage as { findingsReviewed: boolean; chainFactsVerified: boolean },
    }),
    asOf: assessment.computedAt.toISOString(),
    rulesetVersion: assessment.rulesetVersion,
    disputeState: options.disputeState,
    suppressions: options.suppressions ?? (await publicSuppressions(db, subjectId)).active,
  };
}

/** Staff assessment (contracts `staffAssessmentSchema`): score, ceiling and contributions. */
export async function staffAssessment(db: Database, subjectId: string | null) {
  const current = subjectId ? await currentAssessment(db, subjectId) : null;
  if (!current || current.assessment.score === null)
    return {
      kind: 'unscored' as const,
      reason:
        'There is no published, reviewed evidence for this subject yet, so it has no score. A missing score is not 0.',
      disclosures: [],
    };
  const { assessment } = current;
  return {
    kind: 'scored' as const,
    band: assessment.band as Band,
    score: assessment.score,
    ceiling: (assessment.ceiling === 100 ? 100 : 74) as 74 | 100,
    calibration: 'proposal_not_signed_off' as const,
    rulesetVersion: assessment.rulesetVersion,
    contributions: current.factors
      .filter(({ f }) => f.applied)
      .map(({ f, i }) => ({
        factorCode: i.factorCode,
        contribution: f.contribution,
        explanation: factorExplanation(i.factorCode),
        evidenceRefs: i.evidenceRefs as string[],
      })),
    disclosures: [],
  };
}
