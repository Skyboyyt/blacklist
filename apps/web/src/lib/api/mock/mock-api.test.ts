import {
  addressResearchSchema,
  loginOutcomeSchema,
  resetPasswordOutcomeSchema,
  searchResponseSchema,
  transactionResearchSchema,
} from '@blacklist/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { ADDRESS_FIXTURES } from './fixtures/addresses';
import { AMBIGUOUS_INPUT, EVM, MOCK_AUTH, SOLANA } from './fixtures/ids';
import { TRANSACTION_FIXTURES } from './fixtures/transactions';
import { mockAuthApi, mockHumanVerifier } from './auth-api';
import { createMockResearchApi } from './research-api';

const api = createMockResearchApi({ latencyMs: 0 });

describe('fixtures', () => {
  it('conform to the public contract schemas', () => {
    for (const f of ADDRESS_FIXTURES) expect(addressResearchSchema.safeParse(f).success).toBe(true);
    for (const f of TRANSACTION_FIXTURES) expect(transactionResearchSchema.safeParse(f).success).toBe(true);
  });

  it('never contain a numeric score (P-11)', () => {
    const text = JSON.stringify([ADDRESS_FIXTURES, TRANSACTION_FIXTURES]);
    expect(text).not.toMatch(/"(score|riskScore|risk_score)"/);
  });

  it('use only the recognisable fictional identifier patterns', () => {
    for (const f of ADDRESS_FIXTURES) {
      expect(f.address.startsWith('0xb1ac') || f.address.startsWith('Demo')).toBe(true);
    }
  });

  it('expose only published moderator findings and public timeline events (P1-02)', () => {
    for (const f of ADDRESS_FIXTURES) {
      for (const finding of f.findings) expect(finding.provenance).toBe('moderator_finding');
      for (const factor of f.assessment.factors)
        expect(['moderator_finding', 'platform_analysis']).toContain(factor.provenance);
      for (const event of f.timeline) expect(event.kind).not.toMatch(/report/);
    }
    expect(JSON.stringify(ADDRESS_FIXTURES)).not.toMatch(
      /report_received|ai_observation|community_allegation|reporter/,
    );
  });

  it('cover every band and dispute state', () => {
    const bands = new Set(ADDRESS_FIXTURES.map((f) => f.assessment.band));
    expect([...bands].sort()).toEqual(['high', 'low', 'moderate', 'not_assessed', 'severe']);
    const disputes = new Set(ADDRESS_FIXTURES.map((f) => f.assessment.disputeState));
    expect(disputes).toEqual(new Set(['none', 'under_appeal', 'suspended_pending_review']));
  });
});

describe('mock research API search states', () => {
  const search = async (query: string, chain?: 'ethereum' | 'solana') =>
    searchResponseSchema.parse(await api.search(chain ? { query, chain } : { query }));

  it('returns results for known addresses', async () => {
    expect((await search(EVM.high)).kind).toBe('results');
    expect((await search(SOLANA.lookalikeToken)).kind).toBe('results');
  });

  it('asks for a network for ambiguous input, and resolves it when chosen', async () => {
    expect((await search(AMBIGUOUS_INPUT)).kind).toBe('choose_network');
    expect((await search(AMBIGUOUS_INPUT, 'ethereum')).kind).toBe('not_found');
    expect((await search(AMBIGUOUS_INPUT, 'solana')).kind).toBe('not_found');
  });

  it('covers not found, invalid, unsupported and provider unavailable', async () => {
    expect((await search(`0xb1ac${'0'.repeat(32)}abcd`)).kind).toBe('not_found');
    expect((await search('0x12')).kind).toBe('invalid_identifier');
    expect((await search('example.eth')).kind).toBe('unsupported_network');
    expect((await search(EVM.providerUnavailable)).kind).toBe('provider_unavailable');
  });

  it('throws for the error fixture (route error boundary)', async () => {
    await expect(api.search({ query: EVM.error })).rejects.toThrow();
    await expect(api.getAddressResearch('ethereum', EVM.error)).rejects.toThrow();
  });

  it('never silently replaces an explicitly selected network (P1-06)', async () => {
    expect(await search(EVM.low, 'solana')).toEqual({
      kind: 'invalid_identifier',
      reason: 'This is not a valid Solana address.',
    });
    expect(await search(SOLANA.wallet, 'ethereum')).toEqual({
      kind: 'invalid_identifier',
      reason: 'This is not a valid Ethereum address.',
    });
    expect((await search(`0xb1ac${'0'.repeat(59)}1`, 'solana')).kind).toBe('invalid_identifier');
    const hits = await search(EVM.low, 'ethereum');
    expect(hits.kind === 'results' && hits.hits.every((h) => h.chain === 'ethereum')).toBe(true);
  });

  it('rejects an address on the wrong network', async () => {
    expect((await api.getAddressResearch('solana', EVM.low)).kind).toBe('invalid_identifier');
  });

  it('finds EVM addresses case-insensitively but Solana only exactly', async () => {
    expect((await api.getAddressResearch('ethereum', EVM.low.toUpperCase().replace('0X', '0x'))).kind).toBe(
      'found',
    );
    expect((await api.getAddressResearch('solana', SOLANA.wallet.toLowerCase())).kind).not.toBe('found');
  });
});

describe('mock viewer', () => {
  it('defaults to a member and ignores unknown values', async () => {
    expect(await createMockResearchApi({ viewer: 'root' }).getViewer()).toMatchObject({ role: 'member' });
    expect(await createMockResearchApi({ viewer: 'anonymous' }).getViewer()).toEqual({ kind: 'anonymous' });
  });
});

describe('mock auth API', () => {
  it('returns a generic failure for unknown accounts', async () => {
    expect(await mockAuthApi.login({ email: 'someone@example.test', password: 'x' }, '/dashboard')).toEqual({
      kind: 'invalid_credentials',
    });
  });

  it('answers registration identically whether or not an account exists', async () => {
    expect(await mockAuthApi.registerStart({ email: MOCK_AUTH.memberEmail })).toEqual({ kind: 'accepted' });
    expect(await mockAuthApi.registerStart({ email: 'new@example.test' })).toEqual({ kind: 'accepted' });
  });

  it('maps token prefixes to token problems', async () => {
    const form = { password: 'correct horse battery', confirmPassword: 'correct horse battery' };
    expect(await mockAuthApi.resetPassword('expired-demo-token-0001', form)).toEqual({
      kind: 'token_problem',
      status: 'expired',
    });
    expect(await mockAuthApi.resetPassword('used-demo-token-00001', form)).toEqual({
      kind: 'token_problem',
      status: 'used',
    });
    expect(await mockAuthApi.resetPassword('demo-valid-token-0001', form)).toEqual({ kind: 'success' });
  });

  describe('staff reset (identity §6.3)', () => {
    const form = { password: 'correct horse battery', confirmPassword: 'correct horse battery' };
    const token = 'staff-reset-token-0001';
    afterEach(() => {
      document.cookie = 'bl_mock_passkey=; path=/; max-age=0';
    });

    it('never succeeds on token and password alone', async () => {
      expect(resetPasswordOutcomeSchema.parse(await mockAuthApi.resetPassword(token, form))).toEqual({
        kind: 'passkey_required',
      });
      expect(await mockAuthApi.resetPassword(token, form, { withPasskey: false })).toEqual({
        kind: 'passkey_required',
      });
    });

    it('reports an unfinished ceremony and succeeds only after a verified passkey', async () => {
      document.cookie = 'bl_mock_passkey=cancelled; path=/';
      expect(await mockAuthApi.resetPassword(token, form, { withPasskey: true })).toEqual({
        kind: 'passkey_not_verified',
        result: 'cancelled',
      });
      document.cookie = 'bl_mock_passkey=verified; path=/';
      expect(await mockAuthApi.resetPassword(token, form, { withPasskey: true })).toEqual({
        kind: 'success',
      });
    });

    it('still reports token problems first', async () => {
      expect(await mockAuthApi.resetPassword('expired-staff-token-01', form, { withPasskey: true })).toEqual({
        kind: 'token_problem',
        status: 'expired',
      });
    });
  });

  it('asks for human verification before checking credentials, then accepts the retry', async () => {
    const request = { email: MOCK_AUTH.challengeEmail, password: 'x' };
    expect(loginOutcomeSchema.parse(await mockAuthApi.login(request, '/dashboard'))).toEqual({
      kind: 'human_verification_required',
    });
    const check = await mockHumanVerifier.challenge(document.createElement('div'));
    expect(check.kind).toBe('passed');
    if (check.kind !== 'passed') return;
    expect(await mockAuthApi.login({ ...request, humanVerification: check.response }, '/dashboard')).toEqual({
      kind: 'signed_in',
      redirectTo: '/dashboard',
    });
  });
});
