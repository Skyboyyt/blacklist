/**
 * Risk Score vocabulary (ARCHITECTURE.md §15.1).
 *
 * The Risk Score is an integer from 0 to 100 where HIGHER MEANS MORE RISK.
 * It is never a "trust" or "safety" score, and a low score is never presented as "safe".
 */
export const RISK_SCORE_MIN = 0;
export const RISK_SCORE_MAX = 100;

export type RiskBand = 'low' | 'moderate' | 'high' | 'severe';

/** `not_assessed` means there was not enough usable data — it is distinct from a score of 0. */
export type AssessmentBand = RiskBand | 'not_assessed';

/** How complete and fresh the data behind an assessment is. Independent of the score. */
export type RiskConfidence = 'low' | 'medium' | 'high';

export interface RiskBandRange {
  readonly band: RiskBand;
  /** Inclusive lower bound. */
  readonly min: number;
  /** Inclusive upper bound. */
  readonly max: number;
}

export const RISK_BANDS: readonly RiskBandRange[] = [
  { band: 'low', min: 0, max: 24 },
  { band: 'moderate', min: 25, max: 49 },
  { band: 'high', min: 50, max: 74 },
  { band: 'severe', min: 75, max: 100 },
];
