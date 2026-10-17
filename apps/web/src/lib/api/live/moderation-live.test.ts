import { afterEach, describe, it, expect, vi } from 'vitest';
import { liveMemberApi } from './member';
import { liveModerationApi } from './moderation';

const reply = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  headers: new Headers(),
  json: async () => body,
});
const CASE = '01a146fa-455b-736c-b1e9-1b4b27dae4ce';
afterEach(() => vi.unstubAllGlobals());

describe('live member and moderation adapters (Phase 9a slice 5)', () => {
  it('sends member calls to the documented routes and validates every response', async () => {
    const fetch = vi.fn().mockResolvedValue(reply({ kind: 'ok', data: { id: CASE } }));
    vi.stubGlobal('fetch', fetch);
    const appeal = {
      findingId: CASE,
      grounds: 'Fictional grounds that are long enough to validate.',
      standing: { mechanism: 'documentary' as const, explanation: 'Fictional records', evidence: [] },
    };
    expect(await liveMemberApi.submitAppeal(appeal)).toEqual({ kind: 'ok', data: { id: CASE } });
    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/v1/findings/${CASE}/appeals`);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', credentials: 'same-origin' });

    await liveMemberApi.getResponseTarget({ kind: 'address', chain: 'solana', address: 'Fict1onal' });
    expect(fetch.mock.calls[1]?.[0]).toBe('/api/v1/responses/target?chain=solana&address=Fict1onal');
    // A response that adds fields the contract does not allow is never shown.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ kind: 'ok', data: { id: CASE, owner: 'x' } })));
    expect(await liveMemberApi.submitAppeal(appeal)).toEqual({
      kind: 'error',
      code: 'temporarily_unavailable',
    });
  });

  it('maps refusals to the member contract, and never calls the API for impossible targets', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await liveMemberApi.getSubmission('../admin')).toEqual({ kind: 'error', code: 'not_found' });
    expect(
      await liveMemberApi.submitCorrection({
        projectSlug: '../admin',
        statement: 'x',
        evidence: [],
      } as never),
    ).toEqual({ kind: 'error', code: 'not_found' });
    expect(await liveModerationApi.getProfileState('Not A Slug')).toEqual({
      kind: 'error',
      code: 'not_found',
    });
    expect(await liveModerationApi.getAuditLog('../x')).toEqual({ kind: 'error', code: 'not_found' });
    expect(await liveMemberApi.getResponseChallenge({ kind: 'project', slug: 'fictional' })).toMatchObject({
      code: 'invalid_transition',
    });
    expect(fetch).not.toHaveBeenCalled();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ code: 'session_expired' }, 401)));
    expect(await liveMemberApi.listSubmissions()).toEqual({ kind: 'error', code: 'sign_in_required' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(reply({ code: 'invalid_transition', detail: 'Already decided.' }, 409)),
    );
    expect(await liveMemberApi.withdraw(CASE, 2)).toEqual({
      kind: 'error',
      code: 'invalid_transition',
      detail: 'Already decided.',
    });
  });

  it('keeps the server explanation and current version on staff refusals', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(reply({ code: 'conflict', detail: 'This case changed.', currentVersion: 4 }, 409)),
    );
    expect(await liveModerationApi.assign(CASE, 3, { to: 'me' })).toEqual({
      kind: 'error',
      code: 'conflict',
      detail: 'This case changed.',
      currentVersion: 4,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(reply({ code: 'not_eligible', detail: 'You took part.' }, 403)),
    );
    expect(await liveModerationApi.decide(CASE, 3, { action: 'start_review' })).toEqual({
      kind: 'error',
      code: 'not_eligible',
      detail: 'You took part.',
    });
  });

  it('never sends an approval or suspension without a confirmed step-up', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await liveModerationApi.approveRevision(CASE, 1, 'ab'.repeat(32))).toEqual({
      kind: 'error',
      code: 'stepup_required',
    });
    expect(await liveModerationApi.suspendFinding(CASE, 'Fictional reason for suspension.')).toEqual({
      kind: 'error',
      code: 'stepup_required',
    });
    expect(fetch).not.toHaveBeenCalled();
    // A step-up for one decision never confirms another (the parameters must match).
    expect(
      await liveModerationApi.verifyStepUp('case.accept_report', CASE, [
        CASE,
        2,
        { action: 'reject_abusive' },
      ]),
    ).toEqual({ kind: 'failed' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends project submissions, the audit log and profile state to their routes', async () => {
    const fetch = vi.fn().mockResolvedValue(reply({ kind: 'ok', data: { id: CASE } }));
    vi.stubGlobal('fetch', fetch);
    await liveMemberApi.submitSuggestion({ name: 'Fictional' } as never);
    await liveMemberApi.submitCorrection({
      projectSlug: 'fictional-swap',
      statement: 'x',
      evidence: [],
    } as never);
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      '/api/v1/projects/suggestions',
      '/api/v1/projects/fictional-swap/corrections',
    ]);
    const state = { slug: 'fictional-swap', revision: 2, description: 'Fictional', domains: ['a.example'] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ kind: 'ok', data: state })));
    expect(await liveModerationApi.getProfileState('fictional-swap')).toEqual({ kind: 'ok', data: state });
    const audit = vi.fn().mockResolvedValue(reply({ kind: 'ok', data: [] }));
    vi.stubGlobal('fetch', audit);
    expect(await liveModerationApi.getAuditLog(CASE)).toEqual({ kind: 'ok', data: [] });
    expect(audit.mock.calls[0]?.[0]).toBe(`/api/v1/mod/audit?caseId=${CASE}`);
    // A profile state with extra fields is refused.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ kind: 'ok', data: { ...state, owner: 'x' } })));
    expect(await liveModerationApi.getProfileState('fictional-swap')).toEqual({
      kind: 'error',
      code: 'temporarily_unavailable',
    });
  });

  it('builds the queue query from the request and keeps Phase 10 reads unavailable', async () => {
    const fetch = vi.fn().mockResolvedValue(reply({ code: 'temporarily_unavailable' }, 503));
    vi.stubGlobal('fetch', fetch);
    await liveModerationApi.getQueue({ assignment: 'mine', sort: 'sla_due', page: 2, type: 'appeal_review' });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      '/api/v1/mod/queue?assignment=mine&sort=sla_due&page=2&type=appeal_review',
    );
    // An unavailable API is reported as such, never as an empty audit log.
    expect(await liveModerationApi.getAuditLog()).toEqual({ kind: 'error', code: 'temporarily_unavailable' });
  });
});
