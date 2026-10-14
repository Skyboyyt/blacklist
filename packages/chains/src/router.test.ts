import { describe, it, expect, vi } from 'vitest';
import { createChainDataService, type ChainProvider } from './router.ts';
import { registry } from './registry.ts';
import { evmAdapter } from './adapters/identity.ts';
import { readReceipt } from './providers/read-receipt.ts';
import { ProviderFault } from './providers/rpc-transport.ts';
import type { Sourced, AccountInfo } from './types.ts';
const chain = registry.bySlug('ethereum'),
  address = evmAdapter.parseAddress('0x' + '1'.repeat(40));
if (!chain || !address) throw new Error('fixture_invalid');
const ref = { chainId: chain.chainId, address };
function provider(id = 'node-a', group = 'infra-a', balance = '1'): ChainProvider {
  return {
    id,
    independenceGroup: group,
    supports: (chainId, capability) => chainId === ref.chainId && capability === 'account_info',
    fetchAccountInfo: vi.fn(async (_ref, options): Promise<Sourced<AccountInfo | null>> => {
      const fetchedAt = new Date('2026-10-01T00:00:01Z'),
        snapshot = { kind: 'evm_block' as const, blockNumber: '10', blockHash: '0x' + 'a'.repeat(64) };
      const finality = options.commitment === 'finalized' ? ('final' as const) : ('pending' as const);
      return {
        data: { chainId: ref.chainId, address: ref.address, kind: 'eoa', nativeBalanceRaw: balance },
        provenance: {
          providerId: id,
          fetchedAt,
          snapshot,
          finality,
          decoderVersion: 'evm-v1',
          verification: 'single_source',
          degraded: false,
          receipts: [
            readReceipt({
              chainId: ref.chainId,
              providerId: id,
              independenceGroup: group,
              capability: 'account_info',
              method: 'eth_getBalance',
              subject: ref.address,
              params: { address: ref.address },
              commitment: options.commitment,
              snapshot,
              finality,
              requestedAt: new Date('2026-10-01T00:00:00Z'),
              fetchedAt,
              normalizedFields: { balance },
              decoderVersion: 'evm-v1',
              comparisonSpecVersion: 'account-v1',
            }),
          ],
        },
      };
    }),
  };
}
describe('bounded capability routing and authoritative verification', () => {
  it('deduplicates and caches public lookups; callers cannot mutate shared results', async () => {
    const p = provider(),
      router = createChainDataService([p]);
    const [a, b] = await Promise.all([router.getAccountInfo(ref), router.getAccountInfo(ref)]);
    expect(a.ok && b.ok).toBe(true);
    expect(p.fetchAccountInfo).toHaveBeenCalledTimes(1);
    if (a.ok && a.value.data) Reflect.set(a.value.data, 'nativeBalanceRaw', '999');
    const c = await router.getAccountInfo(ref);
    expect(c.ok && c.value.data?.nativeBalanceRaw).toBe('1');
  });
  it('separates finality and cross-verification cache keys; refuses shared upstreams', async () => {
    const p = provider(),
      same = provider('node-b', 'infra-a'),
      router = createChainDataService([p, same]);
    await router.getAccountInfo(ref);
    const final = await router.getAccountInfo(ref, { minFinality: 'final' });
    const verified = await router.getAccountInfo(ref, { crossVerify: true });
    expect(final.ok && final.value.provenance.finality).toBe('final');
    expect(verified.ok && verified.value.provenance.verification).toBe('unavailable');
    expect(p.fetchAccountInfo).toHaveBeenCalledTimes(3);
    expect(same.fetchAccountInfo).not.toHaveBeenCalled();
  });
  it('binds independent second read to first snapshot; conflicting facts are not displayed or cached', async () => {
    const a = provider(),
      b = provider('node-b', 'infra-b'),
      router = createChainDataService([a, b]);
    const result = await router.getAccountInfo(ref, { crossVerify: true });
    expect(result.ok && result.value.provenance.verification).toBe('agree');
    expect(b.fetchAccountInfo).toHaveBeenCalledWith(
      ref,
      expect.objectContaining({ commitment: 'finalized', blockHash: '0x' + 'a'.repeat(64) }),
    );
    const conflict = createChainDataService([a, provider('node-c', 'infra-c', '2')]);
    expect(await conflict.getAccountInfo(ref, { crossVerify: true })).toMatchObject({
      ok: false,
      error: {
        kind: 'data_conflict',
        receipts: [
          expect.objectContaining({ providerId: 'node-a' }),
          expect.objectContaining({ providerId: 'node-c' }),
        ],
      },
    });
    expect(await conflict.getAccountInfo(ref, { crossVerify: true })).toMatchObject({
      ok: false,
      error: {
        kind: 'data_conflict',
        receipts: [
          expect.objectContaining({ providerId: 'node-a' }),
          expect.objectContaining({ providerId: 'node-c' }),
        ],
      },
    });
  });
  it('fails over, breaks repeated failing capabilities, and shows bounded stale cache only as degraded', async () => {
    let time = 0;
    const bad = provider('bad', 'infra-bad');
    bad.fetchAccountInfo = vi.fn().mockRejectedValue(new ProviderFault('timeout'));
    const good = provider(),
      router = createChainDataService([bad, good], () => time);
    expect((await router.getAccountInfo(ref)).ok).toBe(true);
    time = 16000;
    good.fetchAccountInfo = vi.fn().mockRejectedValue(new ProviderFault('unavailable'));
    const degraded = await router.getAccountInfo(ref);
    expect(degraded.ok && degraded.value.provenance.degraded).toBe(true);
    time = 61000;
    expect(await router.getAccountInfo(ref)).toMatchObject({ ok: false, error: { kind: 'unavailable' } });
  });
  it('returns explicit unsupported capabilities, caps history and rejects duplicate registry IDs', async () => {
    const p = provider(),
      router = createChainDataService([p]);
    expect(await router.getBalances(ref)).toMatchObject({ ok: false, error: { kind: 'not_supported' } });
    expect(await router.getAddressHistory(ref, { limit: 101 })).toMatchObject({
      ok: false,
      error: { kind: 'not_supported' },
    });
    expect(() => createChainDataService([p, p])).toThrow('provider_registry_invalid');
  });
  it('cancels one subscriber without cancelling another caller sharing the same provider request', async () => {
    const p = provider(),
      original = p.fetchAccountInfo;
    if (!original) throw new Error('fixture_invalid');
    let release: (() => void) | undefined, sharedSignal: AbortSignal | undefined;
    p.fetchAccountInfo = vi.fn(async (ref, options) => {
      sharedSignal = options.signal;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return original(ref, options);
    });
    const router = createChainDataService([p]),
      controller = new AbortController();
    const first = router.getAccountInfo(ref, { signal: controller.signal }),
      second = router.getAccountInfo(ref);
    controller.abort();
    expect(await first).toMatchObject({ ok: false, error: { kind: 'timeout' } });
    expect(sharedSignal?.aborted).toBe(false);
    if (!release) throw new Error('fixture_invalid');
    release();
    expect((await second).ok).toBe(true);
    expect(p.fetchAccountInfo).toHaveBeenCalledTimes(1);
  });
  it('opens a capability circuit after three failures and probes again after cooldown', async () => {
    let time = 0;
    const p = provider();
    p.fetchAccountInfo = vi.fn().mockRejectedValue(new ProviderFault('timeout'));
    const router = createChainDataService([p], () => time);
    for (let i = 0; i < 4; i++) expect((await router.getAccountInfo(ref)).ok).toBe(false);
    expect(p.fetchAccountInfo).toHaveBeenCalledTimes(3);
    time = 30001;
    await router.getAccountInfo(ref);
    expect(p.fetchAccountInfo).toHaveBeenCalledTimes(4);
  });
  it('restarts pagination at its snapshot on provider failover without passing another provider cursor', async () => {
    let time = 0,
      fail = false;
    const txHash = evmAdapter.parseTxHash('0x' + 'b'.repeat(64));
    if (!txHash) throw new Error('fixture_invalid');
    const snapshot = { kind: 'evm_block' as const, blockNumber: '10', blockHash: '0x' + 'a'.repeat(64) };
    const history = (id: string): ChainProvider => ({
      id,
      independenceGroup: 'unknown-upstream',
      supports: (_chain, cap) => cap === 'address_history',
      fetchAddressHistory: vi.fn(async () => {
        if (id === 'a' && fail) throw new ProviderFault('timeout');
        return {
          data: {
            items: [
              {
                chainId: ref.chainId,
                txHash,
                block: '10',
                blockTime: null,
                status: 'success' as const,
                direction: 'out' as const,
              },
            ],
            nextCursor: 'private-' + id,
            truncated: true,
          },
          provenance: {
            providerId: id,
            fetchedAt: new Date(),
            snapshot,
            finality: 'pending' as const,
            decoderVersion: 'v1',
            verification: 'single_source' as const,
            degraded: false,
          },
        };
      }),
    });
    const a = history('a'),
      b = history('b'),
      router = createChainDataService([a, b], () => time);
    const first = await router.getAddressHistory(ref, { limit: 20, direction: 'out' });
    if (!first.ok || !first.value.data.nextCursor) throw new Error('fixture_missing');
    time = 16000;
    fail = true;
    const next = await router.getAddressHistory(ref, {
      limit: 20,
      direction: 'out',
      cursor: first.value.data.nextCursor,
    });
    expect(next.ok && next.value.data.restarted).toBe(true);
    expect(b.fetchAddressHistory).toHaveBeenCalledWith(
      ref,
      { limit: 20, direction: 'out', cursor: null },
      expect.objectContaining({ blockHash: snapshot.blockHash }),
    );
    expect(a.fetchAddressHistory).toHaveBeenLastCalledWith(
      ref,
      { limit: 20, direction: 'out', cursor: 'private-a' },
      expect.anything(),
    );
  });
});
