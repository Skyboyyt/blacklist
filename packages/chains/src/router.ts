import type { ChainAddress, ChainId, ChainTxRef } from '@blacklist/core';
import type {
  ChainDataService,
  ProviderClient,
  AccountInfoSource,
  TransactionSource,
  AddressHistorySource,
  BalanceSource,
  TokenMetadataSource,
  ContractSourceSource,
  ReadOptions,
  HistoryQuery,
  ProviderCapability,
  ProviderCallOptions,
  ChainResult,
} from './ports.ts';
import type { Sourced, ChainSnapshot } from './types.ts';
import { registry } from './registry.ts';
import { evmAdapter, solanaAdapter } from './adapters/identity.ts';
import { canonicalFields, compareReceipts } from './verification.ts';
import { ProviderFault } from './providers/rpc-transport.ts';
import { createCursorCodec } from './cursor.ts';

export type ChainProvider = ProviderClient &
  Partial<
    AccountInfoSource &
      TransactionSource &
      AddressHistorySource &
      BalanceSource &
      TokenMetadataSource &
      ContractSourceSource
  >;
type Stored = { expires: number; staleUntil: number; value: unknown };
type Circuit = { failures: number; until: number };
type Flight = { promise: Promise<unknown>; controller: AbortController; subscribers: number };
export function createChainDataService(
  providers: readonly ChainProvider[],
  now = Date.now,
): ChainDataService {
  if (
    new Set(providers.map((p) => p.id)).size !== providers.length ||
    providers.some(
      (p) => !/^[a-z0-9_-]{1,64}$/u.test(p.id) || !/^[a-z0-9_-]{1,64}$/u.test(p.independenceGroup),
    )
  )
    throw new Error('provider_registry_invalid');
  const cache = new Map<string, Stored>(),
    flights = new Map<string, Flight>(),
    circuits = new Map<string, Circuit>();
  const cursors = createCursorCodec(now);
  const adapterFor = (chainId: ChainId) => {
    const c = registry.byId(chainId);
    if (!c) throw new ProviderFault('not_supported');
    return c.family === 'evm' ? evmAdapter : solanaAdapter;
  };
  function callOptions(chainId: ChainId, options: ReadOptions): ProviderCallOptions {
    const c = registry.byId(chainId);
    if (!c) throw new ProviderFault('not_supported');
    const final = options.minFinality === 'final' || options.crossVerify === true;
    return {
      commitment: final ? c.finality.final : c.finality.display,
      signal: options.signal,
      ...(options.atSnapshot?.kind === 'evm_block' ? { blockHash: options.atSnapshot.blockHash } : {}),
      ...(options.atSnapshot?.kind === 'solana_context'
        ? { minContextSlot: options.atSnapshot.contextSlot }
        : {}),
      ...(options.atSnapshot?.kind === 'solana_transaction'
        ? { minContextSlot: options.atSnapshot.slot }
        : {}),
    };
  }
  const failure = <T>(
    chainId: ChainId,
    capability: ProviderCapability,
    kind: ProviderFault['kind'] | 'data_conflict',
    ids: readonly string[],
    retryAfterMs?: number,
  ): ChainResult<T> => ({
    ok: false,
    error: { kind, capability, chainId, providerIds: ids, ...(retryAfterMs ? { retryAfterMs } : {}) },
  });
  async function read<T>(
    chainId: ChainId,
    capability: ProviderCapability,
    subject: string,
    options: ReadOptions,
    operation: (provider: ChainProvider, opts: ProviderCallOptions) => Promise<Sourced<T>>,
  ): Promise<ChainResult<T>> {
    let opts: ProviderCallOptions;
    try {
      opts = callOptions(chainId, options);
    } catch {
      return failure(chainId, capability, 'not_supported', []);
    }
    const key = canonicalFields({
      chainId,
      capability,
      subject,
      commitment: opts.commitment,
      crossVerify: options.crossVerify ?? false,
      snapshot: options.atSnapshot ?? null,
      decoderVersion: 'phase8-v1',
    });
    const cached = cache.get(key);
    if (options.signal?.aborted) return failure(chainId, capability, 'timeout', []);
    if (cached && cached.expires > now())
      return { ok: true, value: structuredClone(cached.value) as Sourced<T> };
    const consume = async (flight: Flight): Promise<ChainResult<T>> => {
      ++flight.subscribers;
      let abort: (() => void) | undefined;
      try {
        const cancelled = new Promise<ChainResult<T>>((resolve) => {
          abort = () => resolve(failure(chainId, capability, 'timeout', []));
          options.signal?.addEventListener('abort', abort, { once: true });
          if (options.signal?.aborted) abort();
        });
        return structuredClone(await Promise.race([flight.promise, cancelled])) as ChainResult<T>;
      } finally {
        if (abort) options.signal?.removeEventListener('abort', abort);
        if (--flight.subscribers === 0) flight.controller.abort();
      }
    };
    const existing = flights.get(key);
    if (existing) return consume(existing);
    if (flights.size >= 16) return failure(chainId, capability, 'rate_limited', [], 1000);
    const controller = new AbortController();
    opts = { ...opts, signal: controller.signal };
    const run = async (): Promise<ChainResult<T>> => {
      const candidates = providers.filter((p) => p.supports(chainId, capability)),
        ids: string[] = [];
      let last: ProviderFault = new ProviderFault(candidates.length ? 'unavailable' : 'not_supported');
      let source: ChainProvider | undefined, first: Sourced<T> | undefined;
      const attempt = async (p: ChainProvider, call: ProviderCallOptions) => {
        const circuitKey = p.id + ':' + capability,
          circuit = circuits.get(circuitKey);
        if (circuit && circuit.until > now()) throw new ProviderFault('unavailable', circuit.until - now());
        ids.push(p.id);
        try {
          const deadline = AbortSignal.timeout(capability === 'address_history' ? 10000 : 5000);
          const result = await operation(p, {
            ...call,
            signal: AbortSignal.any([deadline, ...(call.signal ? [call.signal] : [])]),
          });
          if (
            result.provenance.providerId !== p.id ||
            result.provenance.decoderVersion.length > 64 ||
            (call.blockHash !== undefined &&
              (result.provenance.snapshot.kind !== 'evm_block' ||
                result.provenance.snapshot.blockHash !== call.blockHash)) ||
            (call.commitment === 'finalized' && result.provenance.finality !== 'final')
          )
            throw new ProviderFault('invalid_response');
          circuits.delete(circuitKey);
          return result;
        } catch (error) {
          const fault = error instanceof ProviderFault ? error : new ProviderFault('invalid_response');
          if (['unavailable', 'timeout', 'invalid_response'].includes(fault.kind)) {
            const count = (circuit?.failures ?? 0) + 1;
            circuits.set(circuitKey, { failures: count, until: count >= 3 ? now() + 30000 : 0 });
          }
          throw fault;
        }
      };
      for (const p of candidates) {
        try {
          first = await attempt(p, opts);
          source = p;
          break;
        } catch (error) {
          last = error instanceof ProviderFault ? error : new ProviderFault('unavailable');
          if (controller.signal.aborted) break;
        }
      }
      if (!first || !source) {
        // Conflicts/invalid responses are never converted into last-good authoritative evidence.
        if (cached && cached.staleUntil > now() && !options.crossVerify && last.kind !== 'invalid_response') {
          const value = structuredClone(cached.value) as Sourced<T>;
          return { ok: true, value: { ...value, provenance: { ...value.provenance, degraded: true } } };
        }
        return failure(chainId, capability, last.kind, ids, last.retryAfterMs);
      }
      let value = first;
      if (options.crossVerify) {
        const a = first.provenance.receipts?.[0];
        let verification: ReturnType<typeof compareReceipts> = 'unavailable';
        const receipts = a ? [a] : [];
        const snapshot: ChainSnapshot = first.provenance.snapshot;
        const secondOpts = callOptions(chainId, {
          ...options,
          atSnapshot: snapshot,
          signal: controller.signal,
        });
        for (const secondary of candidates.filter(
          (p) =>
            p.id !== source?.id &&
            p.independenceGroup !== source?.independenceGroup &&
            p.independenceGroup !== 'unknown-upstream',
        )) {
          try {
            const second = await attempt(secondary, secondOpts),
              b = second.provenance.receipts?.[0];
            if (
              !a ||
              !b ||
              a.providerId !== source.id ||
              a.independenceGroup !== source.independenceGroup ||
              b.providerId !== secondary.id ||
              b.independenceGroup !== secondary.independenceGroup
            )
              continue;
            receipts.push(b);
            verification = compareReceipts(a, b);
            break;
          } catch {
            continue;
          }
        }
        if (verification === 'conflict' && receipts[0] && receipts[1])
          return {
            ok: false,
            error: {
              kind: 'data_conflict',
              chainId,
              capability,
              providerIds: ids,
              receipts: [receipts[0], receipts[1]],
            },
          };
        value = { ...first, provenance: { ...first.provenance, verification, receipts } };
      }
      if (cache.size >= 500) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(key, { value: structuredClone(value), expires: now() + 15000, staleUntil: now() + 60000 });
      return { ok: true, value };
    };
    const flight: Flight = {
      promise: run().catch(() => failure(chainId, capability, 'unavailable', [])),
      controller,
      subscribers: 0,
    };
    flights.set(key, flight);
    void flight.promise.finally(() => {
      if (flights.get(key) === flight) flights.delete(key);
    });
    return consume(flight);
  }
  return {
    registry,
    adapterFor,
    getAccountInfo: (ref: ChainAddress, options: ReadOptions = {}) =>
      read(ref.chainId, 'account_info', ref.address, options, (p, o) => {
        if (!p.fetchAccountInfo) throw new ProviderFault('not_supported');
        return p.fetchAccountInfo(ref, o);
      }),
    getTransaction: (ref: ChainTxRef, options: ReadOptions = {}) =>
      read(ref.chainId, 'transaction', ref.txHash, options, (p, o) => {
        if (!p.fetchTransaction) throw new ProviderFault('not_supported');
        return p.fetchTransaction(ref, o);
      }),
    getBalances: (ref: ChainAddress, options: ReadOptions = {}) =>
      read(ref.chainId, 'balances', ref.address, options, (p, o) => {
        if (!p.fetchBalances) throw new ProviderFault('not_supported');
        return p.fetchBalances(ref, o);
      }),
    getTokenInfo: (ref: ChainAddress, options: ReadOptions = {}) =>
      read(ref.chainId, 'token_metadata', ref.address, options, (p, o) => {
        if (!p.fetchTokenInfo) throw new ProviderFault('not_supported');
        return p.fetchTokenInfo(ref, o);
      }),
    getContractInfo: (ref: ChainAddress, options: ReadOptions = {}) =>
      read(ref.chainId, 'contract_source', ref.address, options, (p, o) => {
        if (!p.fetchContractInfo) throw new ProviderFault('not_supported');
        return p.fetchContractInfo(ref, o);
      }),
    getAddressHistory: (ref: ChainAddress, query: HistoryQuery) => {
      if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100)
        return Promise.resolve(failure(ref.chainId, 'address_history', 'not_supported', []));
      const direction = query.direction ?? 'all';
      let cursor: ReturnType<typeof cursors.decode> | undefined;
      try {
        cursor = query.cursor
          ? cursors.decode(query.cursor, {
              chainId: ref.chainId,
              address: ref.address,
              limit: query.limit,
              direction,
            })
          : undefined;
      } catch {
        return Promise.resolve(failure(ref.chainId, 'address_history', 'not_supported', []));
      }
      return read(
        ref.chainId,
        'address_history',
        canonicalFields({
          address: ref.address,
          limit: query.limit,
          direction,
          cursor: query.cursor ?? null,
        }),
        { ...query, ...(cursor ? { atSnapshot: cursor.snapshot } : {}) },
        async (p, o) => {
          if (!p.fetchAddressHistory) throw new ProviderFault('not_supported');
          const restarted = !!cursor && cursor.providerId !== p.id;
          const result = await p.fetchAddressHistory(
            ref,
            { cursor: cursor?.providerId === p.id ? cursor.cursor : null, limit: query.limit, direction },
            o,
          );
          const snapshot = cursor?.snapshot ?? result.provenance.snapshot;
          const boundary =
            snapshot.kind === 'evm_block'
              ? snapshot.blockNumber
              : snapshot.kind === 'solana_context'
                ? snapshot.contextSlot
                : snapshot.slot;
          const items = result.data.items.filter(
            (item) => item.block === null || BigInt(item.block) <= BigInt(boundary),
          );
          const nextCursor = result.data.nextCursor
            ? cursors.encode({
                providerId: p.id,
                chainId: ref.chainId,
                address: ref.address,
                cursor: result.data.nextCursor,
                snapshot,
                limit: query.limit,
                direction,
              })
            : null;
          return {
            ...result,
            data: { ...result.data, items, nextCursor, ...(restarted ? { restarted: true } : {}) },
          };
        },
      );
    },
  };
}
