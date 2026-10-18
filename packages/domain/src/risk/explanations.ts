import type { Assessment, Band, FactorResult } from './engine.ts';

// Public wording for assessments (ARCHITECTURE §15.6): band and reasons, never the numeric
// score or contributions. Weights are words ("primary", "contributing", "minor").

const BAND_TEXT: Readonly<Record<Band | 'not_assessed', string>> = {
  not_assessed:
    'Not assessed. There is not enough reviewed evidence to say anything about this address. This is not a sign that it is safe.',
  low: 'Low risk based on the reviewed evidence available. This is not a guarantee of safety.',
  moderate: 'Moderate risk: reviewed evidence shows reasons for caution.',
  high: 'High risk: reviewed evidence shows serious reasons for caution.',
  severe: 'Severe risk: an independently approved moderator finding describes serious harm.',
};

const FACTOR_TEXT: Readonly<Record<string, string>> = {
  'finding.severe': 'A severe moderator finding was published after independent approval.',
  'finding.high': 'A high-severity moderator finding was published after review.',
  'finding.medium': 'A medium-severity moderator finding was published after review.',
  'finding.low': 'A low-severity moderator finding was published after review.',
  'token.symbol_impersonation': 'This token uses the symbol of a different, well-known token.',
  'eoa.delegated_to_flagged':
    'This wallet delegates to code with a published high or severe finding. Its owner is often a victim, and funds sent here may be swept.',
};

export const bandExplanation = (assessment: Pick<Assessment, 'band'>) => BAND_TEXT[assessment.band];

export const factorExplanation = (factorCode: string) =>
  FACTOR_TEXT[factorCode] ?? 'A reviewed factor contributes to this assessment.';

/** Relative weight as a word; the public DTO never carries a contribution number. */
export function factorWeight(
  factor: FactorResult,
  all: readonly FactorResult[],
): 'primary' | 'contributing' | 'minor' {
  const max = Math.max(...all.filter((f) => f.applied).map((f) => f.contribution));
  if (factor.contribution === max) return 'primary';
  return factor.contribution >= max / 2 ? 'contributing' : 'minor';
}

/** Plain-language coverage (what was and was not available). */
export function coverageText(assessment: Pick<Assessment, 'coverage'>): string {
  const parts = [
    assessment.coverage.findingsReviewed
      ? 'Published moderator findings were included.'
      : 'Moderator findings were not available.',
    assessment.coverage.chainFactsVerified
      ? 'Verified chain data was included.'
      : 'Automatic chain checks count only after two independent providers confirm them.',
  ];
  return parts.join(' ');
}
