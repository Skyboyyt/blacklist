import { describe, it, expect } from 'vitest';
import { scoreboardResponseSchema } from '@blacklist/contracts';
import { rankProjectDetails, type ScoreboardDetail } from '@blacklist/domain';

// ADR 0012 band-only ranking: the same rule as the web reference (mock/scoreboard.ts).
type Address = ScoreboardDetail['officialAddresses'][number];
type Band = Address['assessment']['band'];
const at = '2026-10-17T10:00:00.000Z';
const address = (
  n: number,
  band: Band,
  options: {
    chain?: 'ethereum' | 'solana';
    confidence?: 'low' | 'medium' | 'high';
    dispute?: Address['assessment']['disputeState'];
  } = {},
): Address => ({
  chain: options.chain ?? 'ethereum',
  address: `0x${String(n).padStart(40, '0')}`,
  displayAddress: `0x${String(n).padStart(40, '0')}`,
  role: 'token',
  basis: 'staff_documentary_review',
  basisNote: 'fixture',
  attributedAt: at,
  assessment: {
    band,
    explanation: 'fixture',
    factors: [],
    confidence: options.confidence ?? 'medium',
    coverage: 'fixture',
    asOf: at,
    rulesetVersion: 'v1.0',
    disputeState: options.dispute ?? 'none',
    suppressions: [],
  },
  disclosures: [],
});
const project = (slug: string, name: string, officialAddresses: Address[]): ScoreboardDetail => ({
  slug,
  name,
  category: 'defi',
  officialAddresses,
  lastReviewedAt: at,
});

describe('project scoreboard (ADR 0012, band-only)', () => {
  const details = [
    project('alpha', 'Alpha', [address(1, 'high'), address(2, 'low')]),
    project('beta', 'Beta', [address(3, 'high', { chain: 'solana' })]),
    project('gamma', 'Gamma', [address(4, 'moderate')]),
    project('delta', 'Delta', [address(5, 'high', { confidence: 'low' })]),
    project('epsilon', 'Epsilon', [address(6, 'severe', { dispute: 'suspended_pending_review' })]),
    project('zeta', 'Zeta', [address(7, 'not_assessed')]),
    project('eta', 'Eta', []),
    project('theta', 'Theta', [address(8, 'low'), address(9, 'not_assessed')]),
  ];

  it('ranks by highest band with shared ranks, A–Z within a band, and never a score', () => {
    const board = scoreboardResponseSchema.parse(rankProjectDetails(details));
    expect(board.ranked.map((r) => [r.slug, r.band, r.rank, r.tied])).toEqual([
      ['alpha', 'high', 1, true],
      ['beta', 'high', 1, true],
      ['gamma', 'moderate', 3, false],
      ['theta', 'low', 4, false],
    ]);
    expect(board.ranked[0]).toMatchObject({
      decidingAddress: { address: `0x${'1'.padStart(40, '0')}` },
      basedOn: { assessed: 2, total: 2 },
    });
    expect(board.ranked.at(-1)?.basedOn).toEqual({ assessed: 1, total: 2 });
    expect(board.notRanked).toEqual([
      { slug: 'delta', name: 'Delta', reason: 'low_confidence' },
      { slug: 'epsilon', name: 'Epsilon', reason: 'suspended_finding' },
      { slug: 'eta', name: 'Eta', reason: 'no_official_addresses' },
      { slug: 'zeta', name: 'Zeta', reason: 'not_assessed' },
    ]);
    expect(JSON.stringify(board)).not.toMatch(/"score"|"contribution"/u);
  });

  it('scopes to a network and leaves out projects with no address there', () => {
    const board = scoreboardResponseSchema.parse(rankProjectDetails(details, 'solana'));
    expect(board.ranked.map((r) => [r.slug, r.rank])).toEqual([['beta', 1]]);
    expect(board.notRanked).toEqual([]);
  });

  it('ranks nothing while public bands are off (every address not assessed)', () => {
    const off = details.map((d) => ({
      ...d,
      officialAddresses: d.officialAddresses.map((a) => ({
        ...a,
        assessment: { ...a.assessment, band: 'not_assessed' as const },
      })),
    }));
    const board = scoreboardResponseSchema.parse(rankProjectDetails(off));
    expect(board).toMatchObject({ asOf: null, ranked: [] });
    expect(
      board.notRanked.every((n) =>
        ['not_assessed', 'no_official_addresses', 'suspended_finding'].includes(n.reason),
      ),
    ).toBe(true);
  });
});
