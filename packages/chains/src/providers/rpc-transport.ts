import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ChainDataErrorKind } from '../ports.ts';

const origins = new Set([
  'https://eth-mainnet.g.alchemy.com',
  'https://mainnet.helius-rpc.com',
  'https://api.mainnet-beta.solana.com',
]);
const envelope = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.string(),
  result: z.unknown().optional(),
  error: z.object({ code: z.number().int(), message: z.string().max(2048) }).optional(),
});
export class ProviderFault extends Error {
  readonly kind: Exclude<ChainDataErrorKind, 'data_conflict'>;
  readonly retryAfterMs: number | undefined;
  constructor(kind: Exclude<ChainDataErrorKind, 'data_conflict'>, retryAfterMs?: number) {
    super('chain_provider_request_failed');
    this.name = 'ProviderFault';
    this.kind = kind;
    this.retryAfterMs = retryAfterMs;
  }
}
export interface RpcTransport {
  call<S extends z.ZodType>(
    method: string,
    params: readonly unknown[],
    schema: S,
    signal?: AbortSignal,
  ): Promise<z.output<S>>;
}
const retryDelay = (value: string | null): number => {
  const seconds =
    value !== null && /^\d+$/u.test(value) ? Number(value) * 1000 : Date.parse(value ?? '') - Date.now();
  return Number.isFinite(seconds) ? Math.max(1000, Math.min(60000, seconds)) : 1000;
};
/** Candidate origins are fixed; this helper does not select or activate a provider (O-3). */
export function createRpcTransport(
  endpoint: string,
  fetcher: typeof fetch = fetch,
  history = false,
): RpcTransport {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error('rpc_endpoint_configuration_invalid');
  }
  if (
    !origins.has(url.origin) ||
    url.username ||
    url.password ||
    url.hash ||
    url.port ||
    url.href.length > 2048
  )
    throw new Error('rpc_endpoint_configuration_invalid');
  const maxBytes = history ? 4 * 1024 * 1024 : 2 * 1024 * 1024;
  const credential =
    url.hostname === 'eth-mainnet.g.alchemy.com'
      ? decodeURIComponent(url.pathname.split('/v2/')[1] ?? '')
      : (url.searchParams.get('api-key') ?? '');
  return {
    async call<S extends z.ZodType>(
      method: string,
      params: readonly unknown[],
      schema: S,
      signal?: AbortSignal,
    ): Promise<z.output<S>> {
      if (
        !/^(eth_(chainId|getBalance|getCode|getBlockByNumber|getBlockByHash|getTransactionByHash|getTransactionReceipt|call|getStorageAt)|alchemy_(getAssetTransfers|getTokenBalances|getTokenMetadata)|get(GenesisHash|AccountInfo|Transaction|SignaturesForAddress|TokenAccountsByOwner|TokenSupply|Slot))$/u.test(
          method,
        )
      )
        throw new ProviderFault('not_supported');
      const id = randomUUID();
      try {
        const response = await fetcher(url.href, {
          method: 'POST',
          redirect: 'error',
          cache: 'no-store',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
          signal: AbortSignal.any([AbortSignal.timeout(history ? 10000 : 5000), ...(signal ? [signal] : [])]),
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new ProviderFault(
            response.status === 429 ? 'rate_limited' : 'unavailable',
            response.status === 429 ? retryDelay(response.headers.get('retry-after')) : undefined,
          );
        }
        if (response.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') {
          await response.body?.cancel();
          throw new ProviderFault('invalid_response');
        }
        const length = response.headers.get('content-length');
        if (length !== null && (!/^\d+$/u.test(length) || Number(length) > maxBytes)) {
          await response.body?.cancel();
          throw new ProviderFault('invalid_response');
        }
        const reader = response.body?.getReader();
        if (!reader) throw new ProviderFault('invalid_response');
        const chunks: Uint8Array[] = [];
        let count = 0;
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            count += chunk.value.byteLength;
            if (count > maxBytes) {
              await reader.cancel();
              throw new ProviderFault('invalid_response');
            }
            chunks.push(chunk.value);
          }
        } finally {
          reader.releaseLock();
        }
        let payload: unknown;
        try {
          payload = JSON.parse(
            new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
            (_key: string, value: unknown, context?: { source?: string }) => {
              if (typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value)) {
                if (context?.source && /^-?\d+$/u.test(context.source)) return context.source;
                throw new ProviderFault('invalid_response');
              }
              return value;
            },
          );
        } catch {
          throw new ProviderFault('invalid_response');
        }
        // A compromised provider must not reflect its credential into otherwise valid metadata/data.
        if (credential && JSON.stringify(payload).includes(credential))
          throw new ProviderFault('invalid_response');
        const parsed = envelope.safeParse(payload);
        if (
          !parsed.success ||
          parsed.data.id !== id ||
          !payload ||
          typeof payload !== 'object' ||
          'result' in payload === 'error' in payload
        )
          throw new ProviderFault('invalid_response');
        if (parsed.data.error) {
          const { code, message } = parsed.data.error;
          // An execution revert is an answer about the queried contract, not a provider outage:
          // it is not retried and does not count toward the provider's circuit.
          if (code === 3 || (code === -32000 && /execution reverted/iu.test(message)))
            throw new ProviderFault('not_supported');
          throw new ProviderFault(
            code === 429 || code === -32005
              ? 'rate_limited'
              : code === -32601
                ? 'not_supported'
                : code === -32009
                  ? 'history_pruned'
                  : code === -32015
                    ? 'not_supported'
                    : 'unavailable',
          );
        }
        const result = schema.safeParse(parsed.data.result);
        if (!result.success) throw new ProviderFault('invalid_response');
        return result.data;
      } catch (error) {
        if (error instanceof ProviderFault) throw error;
        throw new ProviderFault(
          error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
            ? 'timeout'
            : 'unavailable',
        );
      }
    },
  };
}
