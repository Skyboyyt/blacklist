import {
  addressResearchSchema,
  projectDirectoryRequestSchema,
  type ProjectDirectoryRequest,
} from '@blacklist/contracts';
import { describe, expect, it } from 'vitest';
import { ADDRESS_FIXTURES } from './fixtures/addresses';
import { EVM, PROJECT_SOLANA, SOLANA } from './fixtures/ids';
import { PROJECT_ADDRESS_FIXTURES, PROJECT_FIXTURES } from './fixtures/projects';
import { createProjectCatalog } from './project-api';

const catalog = createProjectCatalog(
  addressResearchSchema.array().parse([...ADDRESS_FIXTURES, ...PROJECT_ADDRESS_FIXTURES]),
);
const list = (request: ProjectDirectoryRequest) => catalog.list(projectDirectoryRequestSchema.parse(request));
const slugs = (request: ProjectDirectoryRequest) => {
  const res = list(request);
  return res.kind === 'results' ? res.items.map((i) => i.slug) : res.kind;
};

describe('project fixtures', () => {
  it('cover every V1 public state', () => {
    const d = catalog.details;
    expect(d.some((p) => p.findings.some((f) => f.disputeState === 'under_appeal'))).toBe(true);
    expect(d.some((p) => p.findings.some((f) => f.disputeState === 'suspended_pending_review'))).toBe(true);
    expect(d.some((p) => p.findings.length === 0)).toBe(true);
    expect(d.some((p) => p.officialAddresses.length === 0)).toBe(true);
    expect(d.some((p) => p.officialAddresses.some((a) => a.assessment === null))).toBe(true);
    expect(d.some((p) => p.officialAddresses.some((a) => a.assessment?.band === 'not_assessed'))).toBe(true);
    expect(d.some((p) => p.freshness.state === 'stale')).toBe(true);
    expect(d.some((p) => p.freshness.state === 'partial')).toBe(true);
    expect(d.some((p) => p.responses.length > 0)).toBe(true);
  });

  it('never contain a numeric score and use fictional identifiers only', () => {
    expect(JSON.stringify(catalog.details)).not.toMatch(/"(score|riskScore|risk_score)"/);
    for (const p of PROJECT_FIXTURES) {
      for (const a of p.addresses)
        expect(a.address.startsWith('0xb1ac') || a.address.startsWith('Demo')).toBe(true);
      for (const dom of p.domains) expect(dom.hostname.endsWith('.example')).toBe(true);
    }
  });

  it('compose each official address from its own research record', () => {
    const vault = catalog.details.find((p) => p.slug === 'demo-yield-vault');
    const research = ADDRESS_FIXTURES.find((a) => a.address === EVM.high);
    expect(vault?.officialAddresses[0]?.assessment).toEqual(research?.assessment);
    expect(vault?.findings).toEqual(research?.findings);
  });
});

describe('mock project directory', () => {
  it('pages deterministically, six per page, sorted by name', () => {
    const first = list({});
    expect(first.kind).toBe('results');
    if (first.kind !== 'results') return;
    expect(first.items).toHaveLength(6);
    expect(first.totalItems).toBe(PROJECT_FIXTURES.length);
    expect(first.totalPages).toBe(Math.ceil(PROJECT_FIXTURES.length / 6));
    const names = first.items.map((i) => i.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
    const last = list({ page: 99 });
    expect(last.kind === 'results' && last.page).toBe(first.totalPages);
  });

  it('scopes address queries to the selected network and never guesses one', () => {
    expect(slugs({ query: SOLANA.wallet })).toBe('choose_network');
    expect(slugs({ query: SOLANA.wallet, chain: 'solana' })).toEqual(['demo-wallet-app']);
    expect(list({ query: SOLANA.wallet, chain: 'ethereum' })).toEqual({
      kind: 'invalid_query',
      reason: 'This is not a valid Ethereum address.',
    });
    expect(slugs({ query: EVM.high.toUpperCase().replace('0X', '0x'), chain: 'ethereum' })).toEqual([
      'demo-yield-vault',
    ]);
    expect(slugs({ query: PROJECT_SOLANA.daoTreasury, chain: 'solana' })).toEqual(['demo-dao']);
  });

  it('matches names and official domains, case-insensitively, within the selected network', () => {
    expect(slugs({ query: 'exchange' })).toEqual(['demo-exchange']);
    expect(slugs({ query: 'BRIDGE.example' })).toEqual(['demo-bridge']);
    expect(slugs({ query: 'wallet app', chain: 'solana' })).toEqual(['demo-wallet-app']);
    expect(slugs({ query: 'demoswap', chain: 'solana' })).toBe('no_results');
  });

  it('filters by network, category and published-findings status', () => {
    const solana = list({ chain: 'solana' });
    expect(solana.kind === 'results' && solana.items.every((i) => i.networks.includes('solana'))).toBe(true);
    // Multi-network projects show their identifier on the selected network.
    expect(
      solana.kind === 'results' && solana.items.every((i) => i.primaryIdentifier?.chain === 'solana'),
    ).toBe(true);
    expect(slugs({ category: 'dao' })).toEqual(['demo-dao']);
    expect(slugs({ findings: 'disputed' })).toEqual(['demo-paused-finding', 'demo-rewards-hub']);
    const without = list({ findings: 'without_findings' });
    expect(without.kind === 'results' && without.items.every((i) => i.publishedFindingCount === 0)).toBe(
      true,
    );
    expect(slugs({ findings: 'with_findings', sort: 'most_findings' })).toEqual([
      'demo-paused-finding',
      'demo-rewards-hub',
      'demo-yield-vault',
    ]);
  });

  it('sorts by most recently reviewed', () => {
    const res = list({ sort: 'recently_reviewed' });
    expect(res.kind === 'results' && res.items[0]?.slug).toBe('demo-new-listing');
  });

  it('rejects transaction hashes and reports failures', () => {
    expect(list({ query: `0x${'a'.repeat(64)}` }).kind).toBe('invalid_query');
    expect(list({ query: 'provider-down-demo' }).kind).toBe('provider_unavailable');
    expect(() => list({ query: 'error-demo' })).toThrow();
  });

  it('returns details by slug and the special failure states', () => {
    expect(catalog.get('demoswap').kind).toBe('found');
    expect(catalog.get('no-such-project').kind).toBe('not_found');
    expect(catalog.get('demo-provider-down').kind).toBe('provider_unavailable');
    expect(() => catalog.get('demo-error')).toThrow();
  });
});
