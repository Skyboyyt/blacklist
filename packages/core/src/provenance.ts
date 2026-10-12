/**
 * Provenance categories (PRD §1.1). Every claim, label, signal and finding belongs
 * to exactly one category, and the category is preserved in the database, the API
 * and the UI. "Association does not equal guilt" depends on never blurring these.
 */
export const PROVENANCE_CATEGORIES = [
  'chain_fact',
  'platform_analysis',
  'community_allegation',
  'moderator_finding',
  'ai_observation',
  'external_source',
] as const;

export type Provenance = (typeof PROVENANCE_CATEGORIES)[number];

export const PROVENANCE_DESCRIPTIONS: Readonly<Record<Provenance, string>> = {
  chain_fact: 'Directly observable blockchain data, with its source and finality.',
  platform_analysis: 'Deterministic, versioned Blacklist analysis of blockchain facts.',
  community_allegation: 'Unverified claims submitted by users.',
  moderator_finding: 'Claims reviewed and verified by Blacklist moderators against defined criteria.',
  ai_observation: 'Model-generated observations. Never treated as fact.',
  external_source:
    'Third-party data such as sanctions lists or provider labels, attributed to its publisher.',
};
