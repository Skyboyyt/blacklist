import { afterEach, describe, it, expect, vi } from 'vitest';
import { liveAuthApi } from './auth';
import { liveAccountApi } from './account';
import { liveAdminApi } from './admin';
const reply = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  headers: new Headers(),
  json: async () => body,
});
afterEach(() => vi.unstubAllGlobals());
describe('live adapters preserve contracts and never invent success', () => {
  it('sends login only to same-origin POST with credentials; redirects are constrained', async () => {
    const fetch = vi.fn().mockResolvedValue(reply({ kind: 'signed_in', redirectTo: '/dashboard' }));
    vi.stubGlobal('fetch', fetch);
    expect(
      await liveAuthApi.login(
        { email: 'fictional@example.test', password: 'fictional test password' },
        'https://foreign.example',
      ),
    ).toEqual({ kind: 'signed_in', redirectTo: '/dashboard' });
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/v1/auth/login');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
    });
  });
  it('rejects extra secret/token fields and network failures instead of signing in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(reply({ kind: 'signed_in', redirectTo: '/dashboard', token: 'untrusted' })),
    );
    expect(
      await liveAuthApi.login(
        { email: 'fictional@example.test', password: 'fictional test password' },
        '/dashboard',
      ),
    ).toEqual({ kind: 'temporarily_unavailable' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await liveAuthApi.registerStart({ email: 'fictional@example.test' })).toEqual({
      kind: 'temporarily_unavailable',
    });
    expect(await liveAccountApi.getSecurity()).toEqual({ kind: 'error', code: 'temporarily_unavailable' });
  });
  it('maps real generic token and credential errors; never treats an HTTP error as success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ code: 'invalid_credentials' }, 401)));
    expect(
      await liveAuthApi.login(
        { email: 'fictional@example.test', password: 'fictional test password' },
        '/dashboard',
      ),
    ).toEqual({ kind: 'invalid_credentials' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ code: 'token_invalid' }, 400)));
    expect(await liveAuthApi.confirmEmailChange('fictional_token_12345678')).toEqual({
      kind: 'token_problem',
      status: 'invalid',
    });
  });
  it('shows password-policy rejection without pretending registration or reset succeeded', async () => {
    for (const [code, reason] of [
      ['password_breached', 'breached'],
      ['password_policy_rejected', 'policy'],
    ] as const) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ code }, 400)));
      const form = { handle: 'fictional', password: 'test8888', confirmPassword: 'test8888' };
      expect(await liveAuthApi.registerComplete('fictional_token_12345678', form)).toEqual({
        kind: 'password_rejected',
        reason,
      });
      expect(
        await liveAuthApi.resetPassword('fictional_token_12345678', {
          password: form.password,
          confirmPassword: form.password,
        }),
      ).toEqual({ kind: 'password_rejected', reason });
    }
  });
  it('reports password rejections and stale admin changes instead of a false outage', async () => {
    for (const code of ['password_breached', 'password_policy_rejected'] as const) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ code }, 400)));
      expect(await liveAccountApi.reauthenticate({ password: 'test8888' })).toEqual({ kind: 'error', code });
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ code: 'conflict' }, 409)));
    expect(await liveAdminApi.listStaff()).toMatchObject({ kind: 'error', code: 'invalid_transition' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ code: 'not_eligible' }, 409)));
    expect(await liveAdminApi.listStaff()).toMatchObject({ kind: 'error', code: 'not_eligible' });
  });
  it('bounds auth cold-start waiting without changing non-auth request deadlines', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ kind: 'accepted' })));
    try {
      expect(await liveAuthApi.registerStart({ email: 'fictional@example.test' })).toEqual({
        kind: 'accepted',
      });
      expect(timeout).toHaveBeenLastCalledWith(90_000);
      await liveAccountApi.getSecurity();
      expect(timeout).toHaveBeenLastCalledWith(20_000);
    } finally {
      timeout.mockRestore();
    }
  });
  it('requires an action assertion before any administrator change', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await liveAdminApi.createInvitation({ email: 'fictional@example.test', role: 'admin' })).toEqual({
      kind: 'error',
      code: 'stepup_required',
    });
    expect(
      await liveAdminApi.suppressSignal({
        chain: 'ethereum',
        address: '0x' + '1'.repeat(40),
        factorCode: 'eoa.delegated_to_flagged',
        publicReason: 'Fictional public reason text.',
        internalRationale: 'Fictional internal rationale.',
      }),
    ).toEqual({ kind: 'error', code: 'stepup_required' });
    expect(await liveAdminApi.liftSuppression('fictional', 'Fictional reason text')).toEqual({
      kind: 'error',
      code: 'stepup_required',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
