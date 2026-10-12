import { describe, expect, it } from 'vitest';
import {
  scoreboardEntrySchema,
  projectDetailSchema,
  projectDirectoryRequestSchema,
  projectDirectoryResponseSchema,
  projectSummarySchema,
} from './project.ts';

const at = '2026-09-28T10:15:00Z';
const assessment = {
  band: 'not_assessed',
  explanation: 'Not enough data.',
  factors: [],
  confidence: 'low',
  coverage: 'Little finalized activity.',
  asOf: at,
  rulesetVersion: 'v1-demo',
  disputeState: 'none',
  suppressions: [],
};
const official = {
  chain: 'ethereum',
  address: '0xb1ac000000000000000000000000000000000001',
  displayAddress: '0xb1ac000000000000000000000000000000000001',
  role: 'contract',
  basis: 'official_announcement',
  basisNote: 'Announced on the official domain.',
  attributedAt: at,
  assessment,
  disclosures: [],
};
const detail = {
  slug: 'demo-project',
  name: 'Demo Project',
  category: 'defi',
  description: 'Fictional.',
  officialAddresses: [official],
  domains: [
    { hostname: 'demo.example', basis: 'staff_documentary_review', basisNote: 'Reviewed.', attributedAt: at },
  ],
  findings: [],
  responses: [],
  history: [],
  profileRevision: 1,
  lastReviewedAt: at,
  updatedAt: at,
  freshness: { state: 'current', note: null },
};
const summary = {
  slug: 'demo-project',
  name: 'Demo Project',
  category: 'defi',
  networks: ['ethereum'],
  primaryIdentifier: { chain: 'ethereum', address: official.address, displayAddress: official.address },
  officialAddressCount: 1,
  publishedFindingCount: 0,
  disputeState: 'none',
  lastReviewedAt: at,
  freshness: 'current',
};

describe('project detail (public, P-11)', () => {
  it('accepts a valid staff-created profile', () => {
    expect(projectDetailSchema.safeParse(detail).success).toBe(true);
  });

  it('rejects any numeric score or combined project rating', () => {
    for (const extra of [{ score: 12 }, { riskScore: 40 }, { band: 'low' }, { assessment }]) {
      expect(projectDetailSchema.safeParse({ ...detail, ...extra }).success).toBe(false);
    }
    expect(projectSummarySchema.safeParse({ ...summary, score: 0 }).success).toBe(false);
    expect(projectSummarySchema.safeParse({ ...summary, band: 'low' }).success).toBe(false);
  });

  it('has no submission, verification or rejection state (Proposed ADR 0010)', () => {
    for (const extra of [
      { verificationStatus: 'verified' },
      { reviewStatus: 'rejected' },
      { submittedBy: 'x' },
    ]) {
      expect(projectDetailSchema.safeParse({ ...detail, ...extra }).success).toBe(false);
    }
  });

  it('keeps capability disclosures out of assessment factors', () => {
    const smuggled = {
      ...official,
      assessment: {
        ...assessment,
        factors: [
          {
            id: 'x',
            code: 'mint_authority',
            explanation: 'x',
            provenance: 'platform_analysis',
            weight: 'minor',
            observedAt: at,
          },
        ],
      },
    };
    expect(projectDetailSchema.safeParse({ ...detail, officialAddresses: [smuggled] }).success).toBe(false);
  });

  it('distinguishes an unavailable assessment (null) from not assessed', () => {
    const unavailable = { ...official, assessment: null };
    expect(projectDetailSchema.safeParse({ ...detail, officialAddresses: [unavailable] }).success).toBe(true);
  });

  it('accepts only approved networks and hostnames as plain text', () => {
    expect(
      projectDetailSchema.safeParse({ ...detail, officialAddresses: [{ ...official, chain: 'base' }] })
        .success,
    ).toBe(false);
    for (const hostname of ['https://demo.example', 'demo.example/path', 'DEMO.example', 'localhost']) {
      expect(
        projectDetailSchema.safeParse({ ...detail, domains: [{ ...detail.domains[0], hostname }] }).success,
      ).toBe(false);
    }
  });

  it('rejects malformed slugs', () => {
    for (const slug of ['Demo', 'demo_project', '-demo', 'a', '../etc']) {
      expect(projectDetailSchema.safeParse({ ...detail, slug }).success).toBe(false);
    }
  });
});

describe('project directory', () => {
  it('applies defaults and rejects unknown filters', () => {
    expect(projectDirectoryRequestSchema.parse({})).toEqual({ findings: 'any', sort: 'name', page: 1 });
    expect(projectDirectoryRequestSchema.safeParse({ status: 'verified' }).success).toBe(false);
    expect(projectDirectoryRequestSchema.safeParse({ chain: 'polygon' }).success).toBe(false);
    expect(projectDirectoryRequestSchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it('never returns an empty results page', () => {
    expect(
      projectDirectoryResponseSchema.safeParse({
        kind: 'results',
        items: [],
        page: 1,
        pageSize: 6,
        totalItems: 1,
        totalPages: 1,
      }).success,
    ).toBe(false);
    expect(projectDirectoryResponseSchema.parse({ kind: 'choose_network' }).kind).toBe('choose_network');
  });
});

describe('scoreboard (ADR 0012, band-only)', () => {
  const entry = {
    rank: 1,
    tied: false,
    slug: 'demoswap',
    name: 'DemoSwap',
    category: 'defi',
    networks: ['ethereum'],
    band: 'high',
    decidingAddress: { chain: 'ethereum', address: '0xabc', displayAddress: '0xAbc' },
    basedOn: { assessed: 1, total: 2 },
    disputeState: 'none',
    freshness: 'current',
    lastReviewedAt: '2026-09-01T00:00:00Z',
  };

  it('accepts a band-only entry and rejects any numeric score', () => {
    expect(scoreboardEntrySchema.safeParse(entry).success).toBe(true);
    expect(scoreboardEntrySchema.safeParse({ ...entry, score: 55 }).success).toBe(false);
    expect(scoreboardEntrySchema.safeParse({ ...entry, riskScore: 55 }).success).toBe(false);
  });

  it('never ranks a project as not assessed or stale', () => {
    expect(scoreboardEntrySchema.safeParse({ ...entry, band: 'not_assessed' }).success).toBe(false);
    expect(scoreboardEntrySchema.safeParse({ ...entry, freshness: 'stale' }).success).toBe(false);
  });
});
