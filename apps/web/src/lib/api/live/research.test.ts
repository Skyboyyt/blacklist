import { randomBytes } from 'node:crypto';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cookies } from 'next/headers';
import { liveResearchApi } from './research';
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => undefined })) }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const setup = () => {
  vi.stubEnv('NEXT_PUBLIC_API_MODE', '');
  vi.stubEnv('API_INTERNAL_URL', 'http://localhost:4107');
  vi.stubEnv('INTERNAL_API_TOKEN', randomBytes(32).toString('hex'));
  vi.stubEnv('DEPLOYMENT_ENV', 'local');
};
describe('non-mock server research adapter', () => {
  it('uses fixed internal GETs, no-store, constrained paths and no browser/provider credential transport', async () => {
    setup();
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ kind: 'not_found' }) });
    vi.stubGlobal('fetch', fetcher);
    expect(await liveResearchApi.getAddressResearch('ethereum', '0x' + '1'.repeat(40))).toEqual({
      kind: 'not_found',
    });
    const [url, options] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://localhost:4107/api/internal/v1/addresses/ethereum/0x' + '1'.repeat(40));
    expect(options).toMatchObject({ method: 'GET', cache: 'no-store', redirect: 'error' });
    expect(Object.keys(options.headers)).toEqual(['x-bl-internal-token']);
    expect(JSON.stringify(options)).not.toMatch(/ALCHEMY|HELIUS|DATABASE_URL/u);
  });
  it('keeps unavailable separate from absent data and refuses extra output fields', async () => {
    setup();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private transport detail')));
    expect(await liveResearchApi.getTransactionResearch('solana', '1'.repeat(64))).toEqual({
      kind: 'provider_unavailable',
      retryAfterSeconds: 30,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ kind: 'not_found', privateUserId: 'must not pass' }),
      }),
    );
    expect(await liveResearchApi.getTransactionResearch('solana', '1'.repeat(64))).toEqual({
      kind: 'provider_unavailable',
      retryAfterSeconds: 30,
    });
  });
  it('never fabricates data when unconfigured and never forwards an unsafe session cookie', async () => {
    vi.stubEnv('API_INTERNAL_URL', '');
    vi.stubEnv('INTERNAL_API_TOKEN', '');
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(await liveResearchApi.search({ query: 'anything' })).toEqual({
      kind: 'provider_unavailable',
      retryAfterSeconds: 30,
    });
    expect(fetcher).not.toHaveBeenCalled();
    setup();
    vi.mocked(cookies).mockResolvedValueOnce({
      get: () => ({ name: '__Host-bl_session', value: 'bad\r\nheader' }),
    } as Awaited<ReturnType<typeof cookies>>);
    await liveResearchApi.getAddressResearch('ethereum', '0x' + '1'.repeat(40));
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('uses the typed history and detail endpoints with opaque scoped pagination', async () => {
    setup();
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ kind: 'provider_unavailable', retryAfterSeconds: 30, reason: 'not_supported' }),
    });
    vi.stubGlobal('fetch', fetcher);
    await liveResearchApi.getAddressHistory?.('ethereum', '0x' + '1'.repeat(40), {
      direction: 'in',
      cursor: 'opaque/page?',
    });
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.pathname).toContain('/addresses/ethereum/');
    expect(url.searchParams.get('cursor')).toBe('opaque/page?');
    expect(url.searchParams.get('direction')).toBe('in');
    expect(url.searchParams.get('limit')).toBe('20');
    for (const method of [
      liveResearchApi.getTokenResearch,
      liveResearchApi.getContractResearch,
      liveResearchApi.getTokenBalances,
    ])
      expect(await method?.('solana', '1'.repeat(32))).toMatchObject({
        kind: 'provider_unavailable',
        reason: 'not_supported',
      });
  });
});
