import { schema, asc, type Database } from '@blacklist/db';
import { projectDetail } from './profiles.ts';
import type { ChainSlug } from '../moderation/subjects.ts';

// Band ranking of reviewed projects (ADR 0012, accepted band-only). The same rule as the
// web reference `apps/web/src/lib/api/mock/scoreboard.ts`:
// - considered addresses are the official addresses, on the selected network when one is
//   chosen (a project with none there is left out of that view);
// - not ranked, with the first reason that applies: stale profile; an assessment that could
//   not be loaded; a suspended finding; nothing assessed; low confidence on every address
//   that sets the band. Missing data is never ranked as low risk;
// - band: the highest band among assessed considered addresses. There is no score;
// - rank: 1 + the number of ranked projects in higher bands, shared within a band; projects
//   in a band are listed A–Z by name, then slug.
// With public bands off (O-12) every address is `not_assessed`, so nothing is ranked.
// Profiles are always current and every official address has a public assessment in this
// slice, so `stale_profile` and `assessment_unavailable` are not produced yet.

type Band = 'severe' | 'high' | 'moderate' | 'low';
type Dispute = 'none' | 'under_appeal' | 'suspended_pending_review';
export type ScoreboardDetail = Pick<
  NonNullable<Awaited<ReturnType<typeof projectDetail>>>,
  'slug' | 'name' | 'category' | 'officialAddresses' | 'lastReviewedAt'
>;
type Detail = ScoreboardDetail;
const BAND_ORDER: Readonly<Record<Band, number>> = { severe: 0, high: 1, moderate: 2, low: 3 };
const DISPUTE_ORDER: Readonly<Record<Dispute, number>> = {
  none: 0,
  under_appeal: 1,
  suspended_pending_review: 2,
};
const LIMIT = 200;

type NotRankedReason = 'suspended_finding' | 'not_assessed' | 'low_confidence' | 'no_official_addresses';

function evaluate(project: Detail, chain: ChainSlug | undefined) {
  const considered = project.officialAddresses.filter((a) => !chain || a.chain === chain);
  if (considered.length === 0)
    return chain
      ? ({ kind: 'skip' } as const)
      : ({ kind: 'not_ranked', reason: 'no_official_addresses' } as const);
  const withAssessment = considered.map((address) => ({ address, assessment: address.assessment }));
  if (withAssessment.some((x) => x.assessment.disputeState === 'suspended_pending_review'))
    return { kind: 'not_ranked', reason: 'suspended_finding' as NotRankedReason } as const;
  const assessed = withAssessment.flatMap((x) =>
    x.assessment.band === 'not_assessed' ? [] : [{ ...x, band: x.assessment.band as Band }],
  );
  if (assessed.length === 0)
    return { kind: 'not_ranked', reason: 'not_assessed' as NotRankedReason } as const;
  const top = Math.min(...assessed.map((x) => BAND_ORDER[x.band]));
  const confident = assessed.find((x) => BAND_ORDER[x.band] === top && x.assessment.confidence !== 'low');
  if (!confident) return { kind: 'not_ranked', reason: 'low_confidence' as NotRankedReason } as const;
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
      band: confident.band,
      decidingAddress: {
        chain: confident.address.chain,
        address: confident.address.address,
        displayAddress: confident.address.displayAddress,
      },
      basedOn: { assessed: assessed.length, total: considered.length },
      disputeState: withAssessment.reduce<Dispute>(
        (worst, x) =>
          DISPUTE_ORDER[x.assessment.disputeState] > DISPUTE_ORDER[worst] ? x.assessment.disputeState : worst,
        'none',
      ),
      freshness: 'current' as const,
      lastReviewedAt: project.lastReviewedAt,
    },
  } as const;
}

/** The ADR 0012 rule over loaded profiles (pure; the reference cases test it). */
export function rankProjectDetails(details: readonly Detail[], chain?: ChainSlug) {
  const ranked: Extract<ReturnType<typeof evaluate>, { kind: 'ranked' }>[] = [];
  const notRanked: { slug: string; name: string; reason: NotRankedReason }[] = [];
  for (const detail of details) {
    const e = evaluate(detail, chain);
    if (e.kind === 'ranked') ranked.push(e);
    else if (e.kind === 'not_ranked')
      notRanked.push({ slug: detail.slug, name: detail.name, reason: e.reason });
  }
  const byName = (a: { name: string; slug: string }, b: { name: string; slug: string }) =>
    a.name.localeCompare(b.name, 'en') || a.slug.localeCompare(b.slug);
  ranked.sort((a, b) => BAND_ORDER[a.entry.band] - BAND_ORDER[b.entry.band] || byName(a.entry, b.entry));
  const inBand = (band: Band) => ranked.filter((r) => r.entry.band === band).length;
  const higher = (band: Band) => ranked.filter((r) => BAND_ORDER[r.entry.band] < BAND_ORDER[band]).length;
  return {
    asOf:
      ranked
        .map((r) => r.asOf)
        .sort()
        .at(-1) ?? null,
    ranked: ranked.map(({ entry }) => ({
      ...entry,
      rank: 1 + higher(entry.band),
      tied: inBand(entry.band) > 1,
    })),
    notRanked: notRanked.sort(byName),
  };
}

/** Public scoreboard (contracts `scoreboardResponseSchema`). Never carries a score. */
export async function projectScoreboard(
  db: Database,
  query: { chain?: ChainSlug | undefined },
  options: { publicBands: boolean },
) {
  const rows = await db
    .select({ slug: schema.projects.slug })
    .from(schema.projects)
    .orderBy(asc(schema.projects.slug))
    .limit(LIMIT);
  const details: Detail[] = [];
  for (const { slug } of rows) {
    const detail = await projectDetail(db, slug, options);
    if (detail) details.push(detail);
  }
  return rankProjectDetails(details, query.chain);
}
