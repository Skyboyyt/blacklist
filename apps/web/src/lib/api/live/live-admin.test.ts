import { afterEach, describe, it, expect, vi } from 'vitest';
import { liveAdminApi } from './admin';
import { verifyLiveStepup } from './step-up';

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(async () => ({ id: 'fictional-credential' })),
}));
const reply = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  headers: new Headers(),
  json: async () => body,
});
afterEach(() => vi.unstubAllGlobals());
const CHALLENGE = '01a146fa-455b-736c-b1e9-1b4b27dae4ce';
const request = {
  chain: 'ethereum' as const,
  address: '0x' + '1'.repeat(40),
  factorCode: 'eoa.delegated_to_flagged' as const,
  publicReason: '  Reviewed: the delegate is not malicious.  ',
  internalRationale: 'Fictional internal rationale.',
};
const label = {
  id: 'L1',
  subject: { chain: 'ethereum', address: '0x' + '1'.repeat(40), displayAddress: '0x' + '1'.repeat(40) },
  text: 'Fictional exchange',
  provenance: 'external_source',
  sourceName: 'Fictional registry',
  basisNote: 'Fictional basis note',
  status: 'active',
  createdBy: { id: 's1', handle: 'staff_one' },
  createdAt: '2026-10-17T00:00:00.000Z',
  retiredAt: null,
};

describe('live admin labels and suppressions (Phase 10 slice 5)', () => {
  it('binds suppression step-ups to the exact request the API re-parses', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        reply({ challengeId: CHALLENGE, options: { challenge: 'x', rpId: 'localhost' } }),
      )
      .mockResolvedValueOnce(reply({ kind: 'verified' }));
    vi.stubGlobal('fetch', fetch);
    expect(await verifyLiveStepup('signal.suppress', 'new', [request])).toEqual({ kind: 'verified' });
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
      action: 'signal.suppress',
      targetType: 'suppression',
      targetId: 'new',
      parameters: { ...request, publicReason: 'Reviewed: the delegate is not malicious.' },
    });
    const write = vi.fn().mockResolvedValue(reply({ kind: 'ok', data: [] }));
    vi.stubGlobal('fetch', write);
    expect(await liveAdminApi.suppressSignal(request)).toEqual({ kind: 'ok', data: [] });
    expect(write.mock.calls[0]?.[0]).toBe('/api/v1/admin/suppressions');
    expect(JSON.parse(String(write.mock.calls[0]?.[1]?.body))).toMatchObject({
      request,
      assertion: { challengeId: CHALLENGE },
    });
    // The assertion is used once.
    expect(await liveAdminApi.suppressSignal(request)).toEqual({ kind: 'error', code: 'stepup_required' });
    // A lift is bound to its suppression and the reason; mismatches fail before any request.
    const none = vi.fn();
    vi.stubGlobal('fetch', none);
    expect(await verifyLiveStepup('signal.suppress', 'other', [request])).toEqual({ kind: 'failed' });
    expect(await verifyLiveStepup('signal.suppression.lift', 'S1', ['S2', 'Fictional reason text'])).toEqual({
      kind: 'failed',
    });
    expect(none).not.toHaveBeenCalled();
  });

  it('reads and writes labels with refreshed, contract-checked lists', async () => {
    const fetch = vi.fn().mockResolvedValue(reply({ kind: 'ok', data: [label] }));
    vi.stubGlobal('fetch', fetch);
    expect(await liveAdminApi.listLabels()).toEqual({ kind: 'ok', data: [label] });
    await liveAdminApi.retireLabel('L1', 'Fictional retirement reason');
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      '/api/v1/admin/labels',
      '/api/v1/admin/labels/retire',
    ]);
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({
      id: 'L1',
      reason: 'Fictional retirement reason',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ kind: 'ok', data: [{ ...label, score: 3 }] })));
    expect(await liveAdminApi.listLabels()).toEqual({ kind: 'error', code: 'temporarily_unavailable' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ code: 'conflict' }, 409)));
    expect(
      await liveAdminApi.addLabel({
        ...request,
        text: 'x',
        provenance: 'moderator_finding',
        basisNote: 'y',
      } as never),
    ).toMatchObject({
      kind: 'error',
      code: 'invalid_transition',
    });
  });
});
