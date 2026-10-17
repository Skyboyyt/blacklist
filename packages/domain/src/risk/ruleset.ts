import { canonicalJson, digest } from '../shared/crypto.ts';

// The V1 ruleset (ARCHITECTURE §15.3) as versioned data. The contributions are a
// CALIBRATION PROPOSAL awaiting owner sign-off (O-12); public bands stay off until then.
// Changing any value means a new version: stored assessments keep the ruleset they used.

export type RiskTier = 'verified' | 'analysis' | 'disclosure' | 'weak';
export type FactorProvenance = 'moderator_finding' | 'platform_analysis';

export interface FactorRule {
  readonly tier: RiskTier;
  readonly provenance: FactorProvenance;
  readonly contribution: number;
}

export interface RulesetDefinition {
  readonly version: string;
  readonly engineVersion: string;
  readonly factors: Readonly<Record<string, FactorRule>>;
  /** Score ceiling without a published, independently approved severe finding (§15.2). */
  readonly ceiling: number;
  readonly severeCeiling: number;
  /** Factor whose presence (with independent approval) lifts the ceiling. */
  readonly severeFactor: string;
  /** Viewing an assessment older than this enqueues a recompute (§15.5). */
  readonly staleAfterHours: number;
  readonly calibration: 'proposal_not_signed_off' | 'signed_off';
}

export const V1_RULESET: RulesetDefinition = {
  version: 'v1.0',
  engineVersion: '1',
  factors: {
    'finding.severe': { tier: 'verified', provenance: 'moderator_finding', contribution: 80 },
    'finding.high': { tier: 'verified', provenance: 'moderator_finding', contribution: 55 },
    'finding.medium': { tier: 'verified', provenance: 'moderator_finding', contribution: 30 },
    'finding.low': { tier: 'verified', provenance: 'moderator_finding', contribution: 10 },
    'token.symbol_impersonation': { tier: 'analysis', provenance: 'platform_analysis', contribution: 30 },
    'eoa.delegated_to_flagged': { tier: 'analysis', provenance: 'platform_analysis', contribution: 40 },
  },
  ceiling: 74,
  severeCeiling: 100,
  severeFactor: 'finding.severe',
  staleAfterHours: 24,
  calibration: 'proposal_not_signed_off',
};

/** SHA-256 of the canonical ruleset, stored with every assessment for replay. */
export const rulesetChecksum = (ruleset: RulesetDefinition) => digest(canonicalJson(ruleset));
