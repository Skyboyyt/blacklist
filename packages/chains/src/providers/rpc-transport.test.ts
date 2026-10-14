import { randomBytes } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createRpcTransport, ProviderFault } from './rpc-transport.ts';
const endpoint = 'https://api.mainnet-beta.solana.com';
const response = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const replying = (result: unknown) =>
  vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    const input: unknown = JSON.parse(String(init?.body));
    if (!input || typeof input !== 'object' || !('id' in input)) throw new Error('fixture_invalid');
    return response({ jsonrpc: '2.0', id: input.id, result });
  });
describe('credential-isolated bounded JSON-RPC', () => {
  it('rejects credential reflection even inside a syntactically valid provider result', async () => {
    const key = randomBytes(32).toString('hex');
    await expect(
      createRpcTransport('https://mainnet.helius-rpc.com/?api-key=' + key, replying({ name: key })).call(
        'getAccountInfo',
        [],
        z.object({ name: z.string() }),
      ),
    ).rejects.toMatchObject({ kind: 'invalid_response', message: 'chain_provider_request_failed' });
  });
  it('allows only fixed candidate HTTPS origins and read methods', async () => {
    for (const url of [
      'http://api.mainnet-beta.solana.com',
      'https://localhost/rpc',
      'https://127.0.0.1/rpc',
      'https://example.test/rpc',
      endpoint + '#secret',
      'https://user:secret@api.mainnet-beta.solana.com',
      endpoint + ':8443',
    ])
      expect(() => createRpcTransport(url)).toThrow('rpc_endpoint_configuration_invalid');
    const fetcher = replying('100');
    const rpc = createRpcTransport(endpoint, fetcher);
    await expect(rpc.call('sendTransaction', [], z.unknown())).rejects.toMatchObject({
      kind: 'not_supported',
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await rpc.call('getSlot', [], z.string())).toBe('100');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
    });
  });
  it('rejects wrong IDs, mixed result/error, invalid JSON and malformed values', async () => {
    for (const body of [
      { jsonrpc: '2.0', id: 'wrong', result: 1 },
      { jsonrpc: '1.0', id: 'wrong', result: 1 },
      { jsonrpc: '2.0', id: 'wrong', result: 1, error: { code: -1, message: 'bad' } },
    ]) {
      await expect(
        createRpcTransport(endpoint, vi.fn().mockResolvedValue(response(body))).call(
          'getSlot',
          [],
          z.number(),
        ),
      ).rejects.toMatchObject({ kind: 'invalid_response' });
    }
    await expect(
      createRpcTransport(endpoint, replying({ bad: true })).call('getSlot', [], z.number()),
    ).rejects.toMatchObject({ kind: 'invalid_response' });
  });
  it('stops declared and streaming oversized responses without retaining raw payloads', async () => {
    const big = new Response('private provider text', {
      headers: { 'content-type': 'application/json', 'content-length': '9999999' },
    });
    await expect(
      createRpcTransport(endpoint, vi.fn().mockResolvedValue(big)).call('getSlot', [], z.number()),
    ).rejects.toMatchObject({ kind: 'invalid_response' });
    const streaming = new Response('x'.repeat(2 * 1024 * 1024 + 1), {
      headers: { 'content-type': 'application/json' },
    });
    await expect(
      createRpcTransport(endpoint, vi.fn().mockResolvedValue(streaming)).call('getSlot', [], z.number()),
    ).rejects.toMatchObject({ kind: 'invalid_response' });
  });
  it('honours bounded rate-limit metadata and never leaks network/provider text', async () => {
    const rate = new Response('private provider text', { status: 429, headers: { 'retry-after': '99999' } });
    await expect(
      createRpcTransport(endpoint, vi.fn().mockResolvedValue(rate)).call('getSlot', [], z.number()),
    ).rejects.toMatchObject({
      kind: 'rate_limited',
      retryAfterMs: 60000,
      message: 'chain_provider_request_failed',
    });
    const failure = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('credential-bearing URL must stay private'));
    const result = createRpcTransport(endpoint, failure).call('getSlot', [], z.number());
    await expect(result).rejects.toBeInstanceOf(ProviderFault);
    await expect(result).rejects.toMatchObject({
      message: 'chain_provider_request_failed',
      kind: 'unavailable',
    });
  });
  it('combines external cancellation with lookup/history deadlines', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const controller = new AbortController();
    try {
      await createRpcTransport(endpoint, replying(1)).call('getSlot', [], z.number(), controller.signal);
      expect(timeout).toHaveBeenLastCalledWith(5000);
      await createRpcTransport(endpoint, replying(1), true).call('getSlot', [], z.number());
      expect(timeout).toHaveBeenLastCalledWith(10000);
      await expect(
        createRpcTransport(
          endpoint,
          vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')),
        ).call('getSlot', [], z.number()),
      ).rejects.toMatchObject({ kind: 'timeout' });
    } finally {
      timeout.mockRestore();
    }
  });
  it('preserves exact unsafe RPC integer tokens while ignoring UI-only decimals', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const input = JSON.parse(String(init?.body)) as { id: string };
      return new Response(
        `{"jsonrpc":"2.0","id":"${input.id}","result":{"lamports":9007199254740993,"uiAmount":0.1}}`,
        { headers: { 'content-type': 'application/json' } },
      );
    });
    const result = await createRpcTransport(endpoint, fetcher).call(
      'getAccountInfo',
      [],
      z.object({ lamports: z.string() }),
    );
    expect(result.lamports).toBe('9007199254740993');
  });
  it('rejects invalid UTF8 and never returns provider error text or follows redirects', async () => {
    const invalid = new Response(new Uint8Array([0xff, 0xfe]), {
      headers: { 'content-type': 'application/json' },
    });
    await expect(
      createRpcTransport(endpoint, vi.fn().mockResolvedValue(invalid)).call('getSlot', [], z.number()),
    ).rejects.toMatchObject({ kind: 'invalid_response' });
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const input = JSON.parse(String(init?.body)) as { id: string };
      return response({
        jsonrpc: '2.0',
        id: input.id,
        error: { code: -32601, message: 'private configuration must not escape' },
      });
    });
    await expect(createRpcTransport(endpoint, fetcher).call('getSlot', [], z.number())).rejects.toMatchObject(
      { kind: 'not_supported', message: 'chain_provider_request_failed' },
    );
  });
});
