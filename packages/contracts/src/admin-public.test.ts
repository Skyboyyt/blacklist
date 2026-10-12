import { describe, expect, it } from 'vitest';
import { labelRequestSchema, suppressionRequestSchema } from './admin.ts';
import { publicLabelSchema, publicSuppressionSchema, subjectResponseSchema } from './research.ts';
import { responseRequestSchema, standingProofSchema } from './submissions.ts';

const at = '2026-10-01T12:00:00Z';

describe('public labels, suppressions and responses', () => {
  it('a public label carries no score, weight or internal basis', () => {
    const label = {
      id: 'l1',
      text: 'Exchange wallet',
      provenance: 'external_source',
      sourceName: 'Registry',
      addedAt: at,
    };
    expect(publicLabelSchema.safeParse(label).success).toBe(true);
    for (const extra of [{ weight: 'primary' }, { score: 10 }, { basisNote: 'internal' }]) {
      expect(publicLabelSchema.safeParse({ ...label, ...extra }).success).toBe(false);
    }
    expect(publicLabelSchema.safeParse({ ...label, provenance: 'community_allegation' }).success).toBe(false);
  });

  it('only analysis indicators can be suppressed; the public view has no internal rationale', () => {
    const base = {
      chain: 'ethereum',
      address: '0xabc',
      factorCode: 'eoa.delegated_to_flagged',
      publicReason: 'A public reason long enough.',
      internalRationale: 'An internal rationale long enough.',
    };
    expect(suppressionRequestSchema.safeParse(base).success).toBe(true);
    expect(suppressionRequestSchema.safeParse({ ...base, factorCode: 'finding.severe' }).success).toBe(false);
    const view = { factorCode: 'eoa.delegated_to_flagged', publicReason: 'r', at };
    expect(publicSuppressionSchema.safeParse(view).success).toBe(true);
    expect(publicSuppressionSchema.safeParse({ ...view, internalRationale: 'x' }).success).toBe(false);
  });

  it('an external label must name its source', () => {
    const label = {
      chain: 'ethereum',
      address: '0xabc',
      text: 'Exchange wallet',
      provenance: 'external_source',
      basisNote: 'A basis note long enough.',
    };
    expect(labelRequestSchema.safeParse(label).success).toBe(false);
    expect(labelRequestSchema.safeParse({ ...label, sourceName: 'Registry' }).success).toBe(true);
  });

  it('a published response records when standing was proven and nothing about the responder', () => {
    const r = { id: 'r1', summary: 'Text.', standing: 'documentary', standingProvenAt: at, publishedAt: at };
    expect(subjectResponseSchema.safeParse(r).success).toBe(true);
    expect(subjectResponseSchema.safeParse({ ...r, responderId: 'u1' }).success).toBe(false);
  });

  it('standing proofs are simulated or documentary; a signature request never carries signature data', () => {
    expect(standingProofSchema.safeParse({ mechanism: 'signature', simulated: true }).success).toBe(true);
    expect(
      standingProofSchema.safeParse({ mechanism: 'signature', simulated: true, signature: '0xdead' }).success,
    ).toBe(false);
    expect(
      standingProofSchema.safeParse({
        mechanism: 'authority_signature',
        authorityRole: 'root',
        simulated: true,
      }).success,
    ).toBe(false);
    expect(
      responseRequestSchema.safeParse({
        target: { kind: 'project', slug: 'demoswap' },
        body: 'short',
        standing: { mechanism: 'signature', simulated: true },
      }).success,
    ).toBe(false);
  });
});
