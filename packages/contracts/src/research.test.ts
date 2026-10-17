import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { reportSummarySchema } from './member.ts';
import {
  addressResearchSchema,
  DISCLOSURE_CODES,
  disclosureSchema,
  findingSummarySchema,
  publicAssessmentSchema,
  riskFactorSchema,
  timelineEventSchema,
  V1_RISK_FACTOR_PROVENANCE,
} from './research.ts';
import { searchResponseSchema } from './search.ts';
import { chainReadSourceSchema } from './chain-reads.ts';

const at = '2026-09-28T10:15:00Z';

const assessment = {
  band: 'moderate',
  explanation: 'Example explanation.',
  factors: [],
  confidence: 'medium',
  coverage: 'Complete.',
  asOf: at,
  rulesetVersion: 'v1',
  disputeState: 'none',
  suppressions: [],
};

const factor = {
  id: 'f1',
  code: 'token.symbol_impersonation',
  explanation: 'x',
  provenance: 'platform_analysis',
  weight: 'primary',
  observedAt: at,
};

const research = {
  chain: 'ethereum',
  address: '0xb1ac000000000000000000000000000000000001',
  displayAddress: '0xb1ac000000000000000000000000000000000001',
  kind: 'wallet',
  untrustedLabel: null,
  assessment,
  facts: [],
  disclosures: [],
  labels: [],
  findings: [],
  responses: [],
  transfers: [],
  evidence: [],
  timeline: [],
};

describe('CSP compatibility', () => {
  it('runs Zod jitless so parsing never needs eval (no unsafe-eval in the CSP)', () => {
    expect(z.config().jitless).toBe(true);
  });
});
describe('explicit live availability boundaries', () => {
  it('rejects wrong-network snapshot metadata and private provenance fields', () => {
    const source = {
      chain: 'ethereum',
      source: 'Ethereum RPC',
      fetchedAt: at,
      finality: 'final',
      snapshot: { kind: 'evm_block', blockNumber: '10', blockHash: '0x' + 'a'.repeat(64) },
      verification: 'single_source',
      degraded: false,
    };
    expect(chainReadSourceSchema.safeParse(source).success).toBe(true);
    expect(chainReadSourceSchema.safeParse({ ...source, chain: 'solana' }).success).toBe(false);
    expect(chainReadSourceSchema.safeParse({ ...source, providerCredential: 'must-not-pass' }).success).toBe(
      false,
    );
  });
  it('rejects risk verdicts or records presented alongside unavailable sections', () => {
    const availability = {
      assessment: 'unavailable',
      findings: 'unavailable',
      labels: 'unavailable',
      responses: 'unavailable',
      transfers: 'unavailable',
      evidence: 'unavailable',
      history: 'unavailable',
      disclosures: 'unavailable',
    };
    const live = { ...research, availability, assessment: { ...assessment, band: 'not_assessed' } };
    expect(addressResearchSchema.safeParse(live).success).toBe(true);
    expect(addressResearchSchema.safeParse({ ...live, assessment }).success).toBe(false);
    expect(
      addressResearchSchema.safeParse({
        ...live,
        labels: [{ id: 'a', text: 'label', provenance: 'moderator_finding', sourceName: null, addedAt: at }],
      }).success,
    ).toBe(false);
  });
});

describe('public assessment: no numeric score (P-11)', () => {
  it('accepts band + explanation without a score', () => {
    expect(publicAssessmentSchema.safeParse(assessment).success).toBe(true);
  });

  it('rejects a numeric score in a public DTO', () => {
    expect(publicAssessmentSchema.safeParse({ ...assessment, score: 42 }).success).toBe(false);
    expect(publicAssessmentSchema.safeParse({ ...assessment, riskScore: 42 }).success).toBe(false);
    expect(addressResearchSchema.safeParse({ ...research, score: 42 }).success).toBe(false);
  });

  it('rejects numeric factor weights or contributions', () => {
    expect(riskFactorSchema.safeParse(factor).success).toBe(true);
    expect(riskFactorSchema.safeParse({ ...factor, weight: 30 }).success).toBe(false);
    expect(riskFactorSchema.safeParse({ ...factor, contribution: 30 }).success).toBe(false);
  });
});

describe('P1-01: capability disclosures contribute zero and are never risk factors', () => {
  it('no disclosure code is an approved V1 risk factor code', () => {
    const factorCodes = Object.keys(V1_RISK_FACTOR_PROVENANCE);
    for (const code of DISCLOSURE_CODES) expect(factorCodes).not.toContain(code);
  });

  it.each([
    'upgradeable_proxy',
    'pause_authority',
    'mint_authority',
    'unverified_source',
    'freeze_authority',
  ])('%s cannot populate the risk-factor collection', (code) => {
    expect(riskFactorSchema.safeParse({ ...factor, code }).success).toBe(false);
    const withFactor = { ...assessment, factors: [{ ...factor, code }] };
    expect(publicAssessmentSchema.safeParse(withFactor).success).toBe(false);
  });

  it.each(['upgradeable_proxy', 'pause_authority', 'mint_authority', 'unverified_source'])(
    '%s can be shown as a disclosure without any weight or contribution field',
    (code) => {
      const disclosure = {
        id: 'd1',
        code,
        label: 'L',
        explanation: 'E',
        provenance: 'chain_fact',
        source: 'Finalized node read',
        observedAt: at,
      };
      expect(disclosureSchema.safeParse(disclosure).success).toBe(true);
      expect(disclosureSchema.safeParse({ ...disclosure, weight: 'minor' }).success).toBe(false);
      expect(disclosureSchema.safeParse({ ...disclosure, contribution: 0 }).success).toBe(false);
      expect(addressResearchSchema.safeParse({ ...research, disclosures: [disclosure] }).success).toBe(true);
    },
  );

  it('requires a bounded source label that is never a link (P1-05)', () => {
    const disclosure = {
      id: 'd1',
      code: 'mint_authority',
      label: 'L',
      explanation: 'E',
      provenance: 'chain_fact',
      source: 'Finalized node read',
      observedAt: at,
    };
    expect(disclosureSchema.safeParse(disclosure).success).toBe(true);
    const { source: _omitted, ...withoutSource } = disclosure;
    expect(disclosureSchema.safeParse(withoutSource).success).toBe(false);
    for (const source of ['', 'x'.repeat(81), 'https://rpc.example/key=abc', 'www.provider.example']) {
      expect(disclosureSchema.safeParse({ ...disclosure, source }).success).toBe(false);
    }
  });

  it('a disclosure object is not accepted as a risk factor', () => {
    const disclosure = {
      id: 'd1',
      code: 'mint_authority',
      label: 'L',
      explanation: 'E',
      provenance: 'chain_fact',
      observedAt: at,
    };
    expect(riskFactorSchema.safeParse(disclosure).success).toBe(false);
  });

  it('factor provenance must match the approved factor code', () => {
    expect(
      riskFactorSchema.safeParse({ ...factor, code: 'finding.high', provenance: 'moderator_finding' })
        .success,
    ).toBe(true);
    expect(
      riskFactorSchema.safeParse({ ...factor, code: 'finding.high', provenance: 'platform_analysis' })
        .success,
    ).toBe(false);
  });
});

describe('P1-02: public research rejects private, unreviewed and deferred payloads', () => {
  it('rejects report-receipt and other private events in the public timeline', () => {
    const event = { id: 'e', label: 'Report received', at, actor: 'system' };
    for (const kind of [
      'report_received',
      'report_submitted',
      'report_draft_saved',
      'queue_assigned',
      'assessment_updated',
    ]) {
      expect(timelineEventSchema.safeParse({ ...event, kind }).success).toBe(false);
    }
    expect(
      timelineEventSchema.safeParse({ ...event, kind: 'finding_published', actor: 'community' }).success,
    ).toBe(false);
    expect(
      addressResearchSchema.safeParse({ ...research, timeline: [{ ...event, kind: 'report_received' }] })
        .success,
    ).toBe(false);
  });

  it('rejects unreviewed allegations and AI output as public findings', () => {
    const finding = {
      id: 'f',
      title: 't',
      summary: 's',
      provenance: 'moderator_finding',
      publishedAt: at,
      disputeState: 'none',
    };
    expect(findingSummarySchema.safeParse(finding).success).toBe(true);
    for (const provenance of [
      'community_allegation',
      'ai_observation',
      'external_source',
      'platform_analysis',
    ]) {
      expect(findingSummarySchema.safeParse({ ...finding, provenance }).success).toBe(false);
    }
  });

  it('rejects allegation, AI and external-source payloads as risk factors', () => {
    for (const provenance of ['community_allegation', 'ai_observation', 'external_source', 'chain_fact']) {
      expect(riskFactorSchema.safeParse({ ...factor, provenance }).success).toBe(false);
    }
    expect(riskFactorSchema.safeParse({ ...factor, code: 'ai.risk' }).success).toBe(false);
    expect(riskFactorSchema.safeParse({ ...factor, code: 'report.pending' }).success).toBe(false);
  });

  it('rejects private reporter metadata, pending counts and moderation data on the public research object', () => {
    for (const extra of [
      { pendingReportCount: 3 },
      { reports: [{ id: 'r1', status: 'submitted' }] },
      { reporterHandle: 'someone' },
      { moderationQueue: [] },
      { aiAssessment: { band: 'high' } },
      { allegations: [] },
    ]) {
      expect(addressResearchSchema.safeParse({ ...research, ...extra }).success).toBe(false);
    }
    const finding = {
      id: 'f',
      title: 't',
      summary: 's',
      provenance: 'moderator_finding',
      publishedAt: at,
      disputeState: 'none',
    };
    expect(findingSummarySchema.safeParse({ ...finding, reporterId: 'u1' }).success).toBe(false);
  });

  it('keeps report receipt data in the member-private contract', () => {
    const report = { id: 'r1', title: 't', status: 'submitted', submittedAt: at, updatedAt: at };
    expect(reportSummarySchema.safeParse(report).success).toBe(true);
    expect(addressResearchSchema.safeParse({ ...research, myReports: [report] }).success).toBe(false);
  });
});

describe('search response', () => {
  it('requires at least two candidates when asking the user to choose a network', () => {
    const one = {
      kind: 'choose_network',
      candidates: [{ chain: 'ethereum', interpretedAs: '0x', note: '' }],
    };
    expect(searchResponseSchema.safeParse(one).success).toBe(false);
  });

  it('only allows V1 networks', () => {
    const hit = { kind: 'address', chain: 'bitcoin', id: 'x', displayId: 'x', band: null, summary: '' };
    expect(searchResponseSchema.safeParse({ kind: 'results', hits: [hit] }).success).toBe(false);
  });
});

describe('formatTokenAmount', () => {
  it('formats exactly, without rounding, and trims trailing zeros', async () => {
    const { formatTokenAmount } = await import('./chain-reads.ts');
    expect(formatTokenAmount('511145937781869726780120', 18)).toBe('511,145.93778186972678012');
    expect(formatTokenAmount('976857', 9)).toBe('0.000976857');
    expect(formatTokenAmount('1500000000000000000', 18)).toBe('1.5');
    expect(formatTokenAmount('1000000', 0)).toBe('1,000,000');
    expect(formatTokenAmount('0', 18)).toBe('0');
    // Anything that is not a plain non-negative integer is returned unchanged.
    expect(formatTokenAmount('-5', 2)).toBe('-5');
    expect(formatTokenAmount('12', 300)).toBe('12');
  });
});
