import { scoreboardResponseSchema, type ProjectDetail } from '@blacklist/contracts';
import { describe, expect, it } from 'vitest';
import { createProjectCatalog } from './project-api';
import { rankProjects } from './scoreboard';
import { createStore } from './store';

const details = () => createProjectCatalog(createStore()).details;

describe('band ranking of projects (ADR 0012, band-only)', () => {
  it('orders by band, shares ranks within a band and lists ties A–Z', () => {
    const r = rankProjects(details());
    expect(r.ranked.map((e) => [e.rank, e.band, e.slug])).toEqual([
      [1, 'severe', 'demo-rewards-hub'],
      [2, 'high', 'demo-yield-vault'],
      [3, 'moderate', 'demo-lookalike-stable'],
      [4, 'low', 'demo-bridge'],
      [4, 'low', 'demo-exchange'],
      [4, 'low', 'demo-nft-market'],
      [4, 'low', 'demo-wallet-app'],
      [4, 'low', 'demoswap'],
    ]);
    expect(r.ranked.filter((e) => e.tied).map((e) => e.band)).toEqual(['low', 'low', 'low', 'low', 'low']);
    expect(r.ranked[0]?.tied).toBe(false);
  });

  it('never ranks missing, stale, suspended or unassessed data, and says why', () => {
    const r = rankProjects(details());
    expect(Object.fromEntries(r.notRanked.map((n) => [n.slug, n.reason]))).toEqual({
      'demo-dao': 'not_assessed',
      'demo-dormant-protocol': 'stale_profile',
      'demo-new-listing': 'no_official_addresses',
      'demo-oracle-network': 'assessment_unavailable',
      'demo-paused-finding': 'suspended_finding',
      'demo-quiet-token': 'not_assessed',
    });
    const rankedSlugs = r.ranked.map((e) => e.slug);
    for (const n of r.notRanked) expect(rankedSlugs).not.toContain(n.slug);
  });

  it('carries no numeric score in its output', () => {
    const r = rankProjects(details());
    expect(scoreboardResponseSchema.safeParse(r).success).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/"score"|riskScore/);
  });

  it('considers only official addresses on the selected network', () => {
    const r = rankProjects(details(), 'solana');
    expect(r.ranked.map((e) => [e.rank, e.band, e.slug])).toEqual([
      [1, 'moderate', 'demo-lookalike-stable'],
      [2, 'low', 'demo-exchange'],
      [2, 'low', 'demo-nft-market'],
      [2, 'low', 'demo-wallet-app'],
    ]);
    for (const e of r.ranked) {
      expect(e.networks).toEqual(['solana']);
      expect(e.decidingAddress.chain).toBe('solana');
    }
    expect(r.notRanked.map((n) => n.slug)).toEqual(['demo-dao']);
  });

  it('does not rank a band set only by low-confidence data', () => {
    const projects = details().map((p): ProjectDetail =>
      p.slug !== 'demo-yield-vault'
        ? p
        : {
            ...p,
            officialAddresses: p.officialAddresses.map((a) =>
              a.assessment ? { ...a, assessment: { ...a.assessment, confidence: 'low' } } : a,
            ),
          },
    );
    const r = rankProjects(projects);
    expect(r.notRanked.find((n) => n.slug === 'demo-yield-vault')?.reason).toBe('low_confidence');
    expect(r.ranked.map((e) => [e.rank, e.slug]).slice(0, 2)).toEqual([
      [1, 'demo-rewards-hub'],
      [2, 'demo-lookalike-stable'],
    ]);
  });

  it('follows published decisions: a reversed finding moves a project down', () => {
    const store = createStore();
    const before = rankProjects(createProjectCatalog(store).details);
    const hub = before.ranked.find((e) => e.slug === 'demo-rewards-hub');
    expect(hub?.band).toBe('severe');
    const address = store.addresses.find((a) => a.address === hub?.decidingAddress.address);
    if (!address) throw new Error('missing');
    address.findings = [];
    address.assessment = { ...address.assessment, factors: [], band: 'low', disputeState: 'none' };
    const after = rankProjects(createProjectCatalog(store).details);
    expect(after.ranked.find((e) => e.slug === 'demo-rewards-hub')?.band).toBe('low');
    expect(after.ranked[0]?.slug).toBe('demo-yield-vault');
  });
});
