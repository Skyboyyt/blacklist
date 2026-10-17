import { randomBytes } from 'node:crypto';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cookies } from 'next/headers';
import { liveResearchApi } from './research';
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
  headers: vi.fn(async () => new Headers({ 'x-real-ip': '198.51.100.7' })),
}));
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
    // The visitor's edge IP travels with the internal token, so research limits are per visitor.
    expect(options.headers).toMatchObject({ 'x-bl-client-ip': '198.51.100.7' });
    expect(Object.keys(options.headers).sort()).toEqual(['x-bl-client-ip', 'x-bl-internal-token']);
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
  it('retries once while the API wakes, and never retries a definite answer', async () => {
    setup();
    const hash = '1'.repeat(64);
    const found = { ok: true, status: 200, json: async () => ({ kind: 'not_found' }) };
    // A timeout or connection failure, then an answer.
    let fetcher = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(found);
    vi.stubGlobal('fetch', fetcher);
    expect(await liveResearchApi.getTransactionResearch('solana', hash)).toEqual({ kind: 'not_found' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map(([, options]) => typeof options.signal)).toEqual(['object', 'object']);
    // Render's waking gateway answers 503, then the API answers.
    fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce(found);
    vi.stubGlobal('fetch', fetcher);
    expect(await liveResearchApi.getTransactionResearch('solana', hash)).toEqual({ kind: 'not_found' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    // Two failures: unavailable, after exactly one retry.
    fetcher = vi.fn().mockRejectedValue(new Error('timeout'));
    vi.stubGlobal('fetch', fetcher);
    expect(await liveResearchApi.getTransactionResearch('solana', hash)).toEqual({
      kind: 'provider_unavailable',
      retryAfterSeconds: 30,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    // A definite refusal or a bad body is not retried.
    for (const response of [
      { ok: false, status: 400, json: async () => ({}) },
      { ok: true, status: 200, json: async () => ({ kind: 'unknown' }) },
    ]) {
      fetcher = vi.fn().mockResolvedValue(response);
      vi.stubGlobal('fetch', fetcher);
      expect((await liveResearchApi.getTransactionResearch('solana', hash)).kind).toBe(
        'provider_unavailable',
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it('reads projects, the scoreboard and finalized addresses from fixed internal paths', async () => {
    setup();
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(ok({ kind: 'empty_directory' }))
      .mockResolvedValueOnce(ok({ asOf: null, ranked: [], notRanked: [] }))
      .mockResolvedValueOnce(ok({ kind: 'not_found' }))
      .mockResolvedValueOnce(ok({ kind: 'not_found' }));
    vi.stubGlobal('fetch', fetcher);
    expect(
      await liveResearchApi.listProjects({ query: 'swap', findings: 'any', sort: 'name', page: 2 }),
    ).toEqual({ kind: 'empty_directory' });
    expect(await liveResearchApi.getScoreboard({ chain: 'solana' })).toEqual({
      asOf: null,
      ranked: [],
      notRanked: [],
    });
    expect(await liveResearchApi.getProject('fictional-swap')).toEqual({ kind: 'not_found' });
    await liveResearchApi.getAddressResearch('ethereum', '0x' + '1'.repeat(40), { finality: 'final' });
    expect(
      fetcher.mock.calls.map(([url]) => String(url).replace('http://localhost:4107/api/internal/v1', '')),
    ).toEqual([
      '/projects?query=swap&findings=any&sort=name&page=2',
      '/projects/scoreboard?chain=solana',
      '/projects/fictional-swap',
      `/addresses/ethereum/0x${'1'.repeat(40)}?finality=final`,
    ]);
    // A ranking that carries a numeric score is refused, never shown.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(ok({ asOf: null, ranked: [], notRanked: [], score: 1 })),
    );
    await expect(liveResearchApi.getScoreboard({})).rejects.toThrow();
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
