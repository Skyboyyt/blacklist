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
  it('requires an action assertion and keeps later-phase services unavailable', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await liveAdminApi.createInvitation({ email: 'fictional@example.test', role: 'admin' })).toEqual({
      kind: 'error',
      code: 'stepup_required',
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(await liveAdminApi.listSuppressions()).toEqual({ kind: 'error', code: 'temporarily_unavailable' });
  });
});
