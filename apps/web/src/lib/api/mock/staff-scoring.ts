/**
 * DEMONSTRATION of the staff score (ARCHITECTURE §15.2–§15.3), for the staff UI only.
 *
 * The contribution table below is the documented CALIBRATION PROPOSAL; it is not
 * signed off (O-12). No weights are invented here: only the §15.3 values are used, and
 * `score = min(ceiling, Σ contributions)` with a ceiling of 100 only when a severe
 * finding applies (otherwise 74). Disclosures contribute 0. A `not_assessed` subject is
 * UNSCORED: it never gets a score of 0. Real scoring is server-side (Phase 10).
 */
import { RISK_BANDS } from '@blacklist/core';
import type { AddressResearch, StaffAssessment, V1RiskFactorCode } from '@blacklist/contracts';

export const PROPOSED_CONTRIBUTIONS: Readonly<Record<V1RiskFactorCode, number>> = {
  'finding.severe': 80,
  'finding.high': 55,
  'finding.medium': 30,
  'finding.low': 10,
  'token.symbol_impersonation': 30,
  'eoa.delegated_to_flagged': 40,
};

export function bandForScore(score: number) {
  const range = RISK_BANDS.find((b) => score >= b.min && score <= b.max);
  if (!range) throw new Error(`Score out of range: ${score}`);
  return range.band;
}

export function staffAssessmentFor(research: AddressResearch): StaffAssessment {
  const { assessment, disclosures } = research;
  if (assessment.band === 'not_assessed') {
    return {
      kind: 'unscored',
      reason:
        'There is not enough usable data to assess this address, so it has no score. A missing score is not 0.',
      disclosures,
    };
  }
  const contributions = assessment.factors.map((f) => ({
    factorCode: f.code,
    contribution: PROPOSED_CONTRIBUTIONS[f.code],
    explanation: f.explanation,
    evidenceRefs: [f.id, ...research.findings.map((finding) => finding.id)],
  }));
  const ceiling = assessment.factors.some((f) => f.code === 'finding.severe') ? 100 : 74;
  const score = Math.min(
    ceiling,
    contributions.reduce((sum, c) => sum + c.contribution, 0),
  );
  return {
    kind: 'scored',
    band: bandForScore(score),
    score,
    ceiling,
    calibration: 'proposal_not_signed_off',
    rulesetVersion: assessment.rulesetVersion,
    contributions,
    disclosures,
  };
}
