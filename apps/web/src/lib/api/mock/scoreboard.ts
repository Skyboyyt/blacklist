/**
 * Band ranking of reviewed projects (ADR 0012, accepted band-only). The backend
 * implements the same rule in its research read model; this is its reference.
 *
 * - Considered addresses: the project's official addresses, on the selected network
 *   when one is chosen (a project with none there is left out of that view).
 * - Not ranked, with the first reason that applies: stale profile; an assessment that
 *   could not be loaded; a suspended finding; nothing assessed; low confidence on every
 *   address that sets the band. Missing data is never ranked as low risk.
 * - Band: the highest band among assessed considered addresses. No numeric score.
 * - Rank: 1 + the number of ranked projects in higher bands, shared within a band;
 *   projects in a band are listed A–Z by name, then slug.
 */
import {
  scoreboardResponseSchema,
  type ChainSlugDto,
  type DisputeState,
  type ProjectDetail,
  type ScoreboardEntry,
  type ScoreboardNotRankedReason,
  type ScoreboardResponse,
} from '@blacklist/contracts';

type RankedBand = ScoreboardEntry['band'];
const BAND_ORDER: Readonly<Record<RankedBand, number>> = { severe: 0, high: 1, moderate: 2, low: 3 };
const DISPUTE_ORDER: Readonly<Record<DisputeState, number>> = {
  none: 0,
  under_appeal: 1,
  suspended_pending_review: 2,
};

type Evaluation =
  | { readonly kind: 'skip' }
  | { readonly kind: 'not_ranked'; readonly reason: ScoreboardNotRankedReason }
  | {
      readonly kind: 'ranked';
      readonly entry: Omit<ScoreboardEntry, 'rank' | 'tied'>;
      readonly asOf: string;
    };

function evaluate(project: ProjectDetail, chain: ChainSlugDto | undefined): Evaluation {
  const considered = project.officialAddresses.filter((a) => !chain || a.chain === chain);
  if (considered.length === 0)
    return chain ? { kind: 'skip' } : { kind: 'not_ranked', reason: 'no_official_addresses' };
  if (project.freshness.state === 'stale') return { kind: 'not_ranked', reason: 'stale_profile' };
  if (considered.some((a) => a.assessment === null))
    return { kind: 'not_ranked', reason: 'assessment_unavailable' };
  const withAssessment = considered.flatMap((a) =>
    a.assessment ? [{ address: a, assessment: a.assessment }] : [],
  );
  if (withAssessment.some((x) => x.assessment.disputeState === 'suspended_pending_review')) {
    return { kind: 'not_ranked', reason: 'suspended_finding' };
  }
  const assessed = withAssessment.filter(
    (x): x is typeof x & { assessment: { band: RankedBand } } => x.assessment.band !== 'not_assessed',
  );
  if (assessed.length === 0) return { kind: 'not_ranked', reason: 'not_assessed' };
  const top = Math.min(...assessed.map((x) => BAND_ORDER[x.assessment.band]));
  const deciding = assessed.filter((x) => BAND_ORDER[x.assessment.band] === top);
  const confident = deciding.find((x) => x.assessment.confidence !== 'low');
  if (!confident) return { kind: 'not_ranked', reason: 'low_confidence' };
  return {
    kind: 'ranked',
    asOf:
      assessed
        .map((x) => x.assessment.asOf)
        .sort()
        .at(-1) ?? confident.assessment.asOf,
    entry: {
      slug: project.slug,
      name: project.name,
      category: project.category,
      networks: [...new Set(considered.map((a) => a.chain))],
      band: confident.assessment.band,
      decidingAddress: {
        chain: confident.address.chain,
        address: confident.address.address,
        displayAddress: confident.address.displayAddress,
      },
      basedOn: { assessed: assessed.length, total: considered.length },
      disputeState: withAssessment.reduce<DisputeState>(
        (worst, x) =>
          DISPUTE_ORDER[x.assessment.disputeState] > DISPUTE_ORDER[worst] ? x.assessment.disputeState : worst,
        'none',
      ),
      freshness: project.freshness.state === 'partial' ? 'partial' : 'current',
      lastReviewedAt: project.lastReviewedAt,
    },
  };
}

export function rankProjects(projects: readonly ProjectDetail[], chain?: ChainSlugDto): ScoreboardResponse {
  const ranked: { entry: Omit<ScoreboardEntry, 'rank' | 'tied'>; asOf: string }[] = [];
  const notRanked: ScoreboardResponse['notRanked'] = [];
  for (const p of projects) {
    const e = evaluate(p, chain);
    if (e.kind === 'ranked') ranked.push({ entry: e.entry, asOf: e.asOf });
    else if (e.kind === 'not_ranked') notRanked.push({ slug: p.slug, name: p.name, reason: e.reason });
  }
  const byName = (a: { name: string; slug: string }, b: { name: string; slug: string }) =>
    a.name.localeCompare(b.name, 'en') || a.slug.localeCompare(b.slug);
  ranked.sort((a, b) => BAND_ORDER[a.entry.band] - BAND_ORDER[b.entry.band] || byName(a.entry, b.entry));
  const countInBand = (band: RankedBand) => ranked.filter((r) => r.entry.band === band).length;
  const higherThan = (band: RankedBand) =>
    ranked.filter((r) => BAND_ORDER[r.entry.band] < BAND_ORDER[band]).length;
  return scoreboardResponseSchema.parse({
    asOf:
      ranked
        .map((r) => r.asOf)
        .sort()
        .at(-1) ?? null,
    ranked: ranked.map(({ entry }) => ({
      ...entry,
      rank: 1 + higherThan(entry.band),
      tied: countInBand(entry.band) > 1,
    })),
    notRanked: notRanked.sort(byName),
  });
}
