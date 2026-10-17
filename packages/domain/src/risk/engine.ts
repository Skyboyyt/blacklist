import { RISK_BANDS } from '@blacklist/core';
import { canonicalJson, digest } from '../shared/crypto.ts';
import { rulesetChecksum, type RiskTier, type RulesetDefinition } from './ruleset.ts';

// The V1 risk engine (ARCHITECTURE §15.2–§15.4). `assess` is pure and deterministic: the
// same inputs, ruleset and evaluation time always give the same result, so stored
// assessments can be replayed and are never recomputed with today's rules.

export type SignalStatus = 'active' | 'expired' | 'retracted' | 'suppressed' | 'suspended' | 'superseded';

/** One signal as of its revision (data-model §7 `risk_assessment_inputs`). */
export interface RiskInput {
  readonly signalId: string;
  readonly signalRevision: number;
  readonly factorCode: string;
  readonly tier: RiskTier;
  readonly provenance: string;
  readonly status: SignalStatus;
  /** E.g. finding revision ID and status revision; stored for replay. */
  readonly sourceRevision: string;
  readonly validUntil: string | null;
  /** Published artifact IDs only. */
  readonly evidenceRefs: readonly string[];
  /** Severe findings: published under the independent-approval rule (moderation §4.1). */
  readonly independentlyApproved?: boolean;
  /** Transfer-derived inputs: incoming transfers and unknown authorization never contribute (§15.3). */
  readonly transferDirection?: 'in' | 'out';
  readonly authorization?: 'authorized' | 'unauthorized' | 'unknown';
}

export interface RiskCoverage {
  /** Published findings for the subject were read. */
  readonly findingsReviewed: boolean;
  /** Verified chain facts were available (analysis factors could fire). */
  readonly chainFactsVerified: boolean;
}

export type NotAppliedReason =
  | 'inactive'
  | 'expired'
  | 'not_in_ruleset'
  | 'tier_mismatch'
  | 'zero_contribution_tier'
  | 'weak_inactive'
  | 'incoming_transfer'
  | 'unknown_authorization';

export interface FactorResult {
  readonly signalId: string;
  readonly factorCode: string;
  readonly contribution: number;
  readonly applied: boolean;
  readonly reason: NotAppliedReason | null;
  readonly explanationKey: string;
}

export type Band = 'low' | 'moderate' | 'high' | 'severe';

export interface Assessment {
  readonly score: number | null;
  readonly band: Band | 'not_assessed';
  readonly confidence: 'low' | 'medium' | 'high';
  readonly ceiling: number;
  readonly ceilingApplied: boolean;
  readonly ceilingReason: 'no_severe_finding' | 'severe_finding' | null;
  readonly factors: readonly FactorResult[];
  readonly rulesetVersion: string;
  readonly rulesetChecksum: string;
  readonly engineVersion: string;
  readonly evaluationTime: string;
  readonly effectiveInputsHash: string;
  /** Earliest future change among inputs (expiry), or null (§15.4). */
  readonly nextReviewAt: string | null;
  readonly coverage: RiskCoverage;
  readonly explanationKey: string;
}

export function bandFor(score: number): Band {
  const range = RISK_BANDS.find((b) => score >= b.min && score <= b.max);
  if (!range) throw new Error('score_out_of_range');
  return range.band;
}

function evaluate(input: RiskInput, ruleset: RulesetDefinition, at: number): FactorResult {
  const rule = ruleset.factors[input.factorCode];
  const result = (contribution: number, reason: NotAppliedReason | null): FactorResult => ({
    signalId: input.signalId,
    factorCode: input.factorCode,
    contribution: reason ? 0 : contribution,
    applied: reason === null,
    reason,
    explanationKey: `factor.${input.factorCode}`,
  });
  if (input.tier === 'weak') return result(0, 'weak_inactive');
  if (input.tier === 'disclosure') return result(0, 'zero_contribution_tier');
  if (!rule) return result(0, 'not_in_ruleset');
  if (rule.tier !== input.tier || rule.provenance !== input.provenance) return result(0, 'tier_mismatch');
  if (input.status !== 'active') return result(0, 'inactive');
  if (input.validUntil !== null && Date.parse(input.validUntil) <= at) return result(0, 'expired');
  if (input.transferDirection === 'in') return result(0, 'incoming_transfer');
  if (input.authorization === 'unknown') return result(0, 'unknown_authorization');
  return result(rule.contribution, null);
}

/** `assess(subject, effectiveInputs, ruleset, evaluationTime)` (§15.4). */
export function assess(
  inputs: readonly RiskInput[],
  coverage: RiskCoverage,
  ruleset: RulesetDefinition,
  evaluationTime: string,
): Assessment {
  const at = Date.parse(evaluationTime);
  if (!Number.isFinite(at)) throw new Error('invalid_evaluation_time');
  const sorted = [...inputs].sort((a, b) => (a.signalId < b.signalId ? -1 : a.signalId > b.signalId ? 1 : 0));
  const factors = sorted.map((input) => evaluate(input, ruleset, at));
  const applied = factors.filter((f) => f.applied);
  // Severe needs a published, independently approved severe finding (§15.2).
  const severe = sorted.some(
    (input, i) =>
      factors[i]?.applied &&
      input.factorCode === ruleset.severeFactor &&
      input.independentlyApproved === true,
  );
  const ceiling = severe ? ruleset.severeCeiling : ruleset.ceiling;
  const sum = applied.reduce((total, f) => total + f.contribution, 0);
  // Nothing applies and no chain facts were verified: there is not enough data to say
  // anything, and "not assessed" is never shown as 0 (§15.1).
  const assessed = applied.length > 0 || coverage.chainFactsVerified;
  const score = assessed ? Math.min(ceiling, sum) : null;
  const band = score === null ? 'not_assessed' : bandFor(score);
  const confidence =
    score === null
      ? 'low'
      : coverage.chainFactsVerified && coverage.findingsReviewed
        ? 'high'
        : applied.length
          ? 'medium'
          : 'low';
  const future = sorted
    .map((i) => (i.status === 'active' && i.validUntil !== null ? Date.parse(i.validUntil) : NaN))
    .filter((t) => Number.isFinite(t) && t > at);
  const checksum = rulesetChecksum(ruleset);
  const effectiveInputsHash = digest(
    canonicalJson({
      ruleset: checksum,
      coverage,
      inputs: sorted.map((input, i) => ({
        signalId: input.signalId,
        signalRevision: input.signalRevision,
        status: input.status,
        sourceRevision: input.sourceRevision,
        applied: factors[i]?.applied ?? false,
      })),
    }),
  );
  return {
    score,
    band,
    confidence,
    ceiling,
    ceilingApplied: score !== null && sum > ceiling,
    ceilingReason: score === null ? null : severe ? 'severe_finding' : 'no_severe_finding',
    factors,
    rulesetVersion: ruleset.version,
    rulesetChecksum: checksum,
    engineVersion: ruleset.engineVersion,
    evaluationTime: new Date(at).toISOString(),
    effectiveInputsHash,
    nextReviewAt: future.length ? new Date(Math.min(...future)).toISOString() : null,
    coverage,
    explanationKey: `band.${band}`,
  };
}

/** Re-runs stored inputs with the stored ruleset snapshot; must reproduce the stored result (§15.4). */
export function replay(
  stored: Assessment,
  inputs: readonly RiskInput[],
  ruleset: RulesetDefinition,
): boolean {
  if (rulesetChecksum(ruleset) !== stored.rulesetChecksum) return false;
  return (
    canonicalJson(assess(inputs, stored.coverage, ruleset, stored.evaluationTime)) === canonicalJson(stored)
  );
}
