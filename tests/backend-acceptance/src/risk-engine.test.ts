import { describe, it, expect } from 'vitest';
import {
  assess,
  replay,
  bandFor,
  V1_RULESET,
  rulesetChecksum,
  bandExplanation,
  factorExplanation,
  type RiskInput,
  type RiskCoverage,
} from '@blacklist/domain';

// Phase 10 slice 1: the V1 risk engine (ARCHITECTURE §15). Golden cases, invariants,
// determinism and replay. No database.

const AT = '2026-10-17T12:00:00.000Z';
const findingsOnly: RiskCoverage = { findingsReviewed: true, chainFactsVerified: false };
const full: RiskCoverage = { findingsReviewed: true, chainFactsVerified: true };
let n = 0;
const finding = (
  severity: 'low' | 'medium' | 'high' | 'severe',
  extra: Partial<RiskInput> = {},
): RiskInput => ({
  signalId: `sig-${String(++n).padStart(3, '0')}`,
  signalRevision: 1,
  factorCode: `finding.${severity}`,
  tier: 'verified',
  provenance: 'moderator_finding',
  status: 'active',
  sourceRevision: `rev-${n}`,
  validUntil: null,
  evidenceRefs: [`finding-${n}`],
  independentlyApproved: severity === 'severe',
  ...extra,
});
const analysis = (code: string, extra: Partial<RiskInput> = {}): RiskInput => ({
  ...finding('low'),
  factorCode: code,
  tier: 'analysis',
  provenance: 'platform_analysis',
  independentlyApproved: false,
  ...extra,
});
const run = (inputs: readonly RiskInput[], coverage = findingsOnly) =>
  assess(inputs, coverage, V1_RULESET, AT);

describe('V1 risk engine: golden cases (§15.2–§15.3)', () => {
  it('maps each finding severity to its contribution and band', () => {
    expect(run([finding('low')])).toMatchObject({ score: 10, band: 'low' });
    expect(run([finding('medium')])).toMatchObject({ score: 30, band: 'moderate' });
    expect(run([finding('high')])).toMatchObject({ score: 55, band: 'high' });
    expect(run([finding('severe')])).toMatchObject({
      score: 80,
      band: 'severe',
      ceilingReason: 'severe_finding',
    });
    expect(run([analysis('token.symbol_impersonation')])).toMatchObject({ score: 30, band: 'moderate' });
    expect(run([analysis('eoa.delegated_to_flagged')])).toMatchObject({ score: 40, band: 'moderate' });
  });

  it('caps at 74 without an independently approved severe finding, and at 100 with one', () => {
    expect(run([finding('high'), finding('medium')])).toMatchObject({
      score: 74,
      band: 'high',
      ceilingApplied: true,
    });
    expect(run([finding('severe', { independentlyApproved: false })])).toMatchObject({
      score: 74,
      band: 'high',
      ceilingReason: 'no_severe_finding',
    });
    expect(run([finding('severe'), finding('high')])).toMatchObject({
      score: 100,
      band: 'severe',
      ceilingApplied: true,
    });
  });

  it('never treats missing evidence as zero', () => {
    const none = run([]);
    expect(none).toMatchObject({ score: null, band: 'not_assessed', confidence: 'low' });
    expect(bandExplanation(none)).toMatch(/not a sign that it is safe/);
    expect(run([], full)).toMatchObject({ score: 0, band: 'low' });
  });

  it('band edges follow §15.1', () => {
    expect([0, 24, 25, 49, 50, 74, 75, 100].map(bandFor)).toEqual([
      'low',
      'low',
      'moderate',
      'moderate',
      'high',
      'high',
      'severe',
      'severe',
    ]);
    expect(() => bandFor(101)).toThrow();
  });
});

describe('V1 risk engine: invariants (§15.3, not calibration)', () => {
  it('weak signals, disclosures, incoming transfers and unknown authorization contribute nothing', () => {
    const r = run([
      { ...finding('high'), tier: 'weak', provenance: 'community_allegation' },
      { ...finding('high'), tier: 'disclosure', provenance: 'chain_fact' },
      analysis('eoa.delegated_to_flagged', { transferDirection: 'in' }),
      analysis('eoa.delegated_to_flagged', { authorization: 'unknown' }),
    ]);
    expect(r.factors.map((f) => f.reason)).toEqual([
      'weak_inactive',
      'zero_contribution_tier',
      'incoming_transfer',
      'unknown_authorization',
    ]);
    expect(r).toMatchObject({ score: null, band: 'not_assessed' });
  });

  it('suspended, reversed, superseded and expired signals do not count; mislabelled ones are refused', () => {
    const r = run([
      finding('severe', { status: 'suspended' }),
      finding('high', { status: 'retracted' }),
      finding('high', { status: 'superseded' }),
      finding('high', { validUntil: '2026-10-17T11:59:59.000Z' }),
      { ...finding('high'), provenance: 'platform_analysis' },
      { ...finding('high'), factorCode: 'finding.critical' },
    ]);
    expect(r.factors.map((f) => f.reason)).toEqual([
      'inactive',
      'inactive',
      'inactive',
      'expired',
      'tier_mismatch',
      'not_in_ruleset',
    ]);
    expect(r.band).toBe('not_assessed');
  });

  it('Severe is impossible without a severe finding, whatever else is present', () => {
    const pool = [
      finding('high'),
      finding('high'),
      finding('medium'),
      analysis('eoa.delegated_to_flagged'),
      analysis('token.symbol_impersonation'),
    ];
    for (let mask = 1; mask < 1 << pool.length; mask++) {
      const subset = pool.filter((_, i) => mask & (1 << i));
      expect(run(subset, full).band).not.toBe('severe');
    }
  });

  it('more verification never lowers a score', () => {
    for (const inputs of [[], [finding('low')], [finding('high'), finding('medium')], [finding('severe')]]) {
      const a = run(inputs, findingsOnly).score ?? -1;
      const b = run(inputs, full).score ?? -1;
      expect(b).toBeGreaterThanOrEqual(a);
    }
  });
});

describe('V1 risk engine: determinism, expiry and replay (§15.4)', () => {
  it('ignores input order and changes the inputs hash only when effective inputs change', () => {
    const a = finding('high'),
      b = finding('low');
    expect(run([a, b])).toEqual(run([b, a]));
    expect(run([a, b]).effectiveInputsHash).not.toBe(
      run([a, { ...b, status: 'suspended' }]).effectiveInputsHash,
    );
    expect(run([a, b]).effectiveInputsHash).toBe(
      run([a, { ...b, evidenceRefs: ['other'] }]).effectiveInputsHash,
    );
  });

  it('reports the earliest future expiry as the next review time', () => {
    const r = run([
      finding('high', { validUntil: '2026-11-01T00:00:00.000Z' }),
      finding('low', { validUntil: '2026-10-20T00:00:00.000Z' }),
      finding('low', { validUntil: '2026-10-01T00:00:00.000Z' }),
    ]);
    expect(r.nextReviewAt).toBe('2026-10-20T00:00:00.000Z');
    expect(run([finding('high')]).nextReviewAt).toBeNull();
    // An input that does not count cannot change the result when it expires, so it schedules
    // no review (otherwise a past review time would never move and the sweep would loop).
    expect(
      run([
        finding('high'),
        finding('low', { factorCode: 'not.in.ruleset', validUntil: '2026-10-20T00:00:00.000Z' }),
      ]).nextReviewAt,
    ).toBeNull();
  });

  it('replays a stored result exactly with its ruleset, and refuses a different ruleset', () => {
    const inputs = [finding('severe'), finding('medium')];
    const stored = run(inputs);
    expect(replay(stored, inputs, V1_RULESET)).toBe(true);
    const changed = {
      ...V1_RULESET,
      version: 'v1.1',
      factors: {
        ...V1_RULESET.factors,
        'finding.medium': { ...V1_RULESET.factors['finding.medium']!, contribution: 35 },
      },
    };
    expect(rulesetChecksum(changed)).not.toBe(stored.rulesetChecksum);
    expect(replay(stored, inputs, changed)).toBe(false);
    expect(() => assess(inputs, findingsOnly, V1_RULESET, 'not a time')).toThrow('invalid_evaluation_time');
  });

  it('public wording carries no numbers and names the victim case', () => {
    for (const code of Object.keys(V1_RULESET.factors)) expect(factorExplanation(code)).not.toMatch(/\d/);
    for (const band of ['not_assessed', 'low', 'moderate', 'high', 'severe'] as const)
      expect(bandExplanation({ band })).not.toMatch(/\d/);
    expect(factorExplanation('eoa.delegated_to_flagged')).toMatch(/victim/);
  });
});
