import type { RpcTransport } from './rpc-transport.ts';
import { ProviderFault } from './rpc-transport.ts';
import { setTimeout as delay } from 'node:timers/promises';

/**
 * Per-process, per-key cap. `total` is spent per `totalWindowMs` (default one day) so an
 * exhausted budget recovers instead of disabling research until restart. The operator
 * splits verified plan credits statically between API and worker (O-3).
 */
export function budgetedTransport(
  rpc: RpcTransport,
  limits: {
    readonly perMinute: number;
    readonly total: number;
    readonly concurrency: number;
    readonly totalWindowMs?: number;
  },
  now = Date.now,
): RpcTransport {
  const totalWindowMs = limits.totalWindowMs ?? 24 * 60 * 60 * 1000;
  if (
    [limits.perMinute, limits.total, limits.concurrency, totalWindowMs].some(
      (n) => !Number.isSafeInteger(n) || n < 1,
    )
  )
    throw new Error('provider_budget_invalid');
  let window = now(),
    windowCalls = 0,
    totalWindow = now(),
    total = 0,
    inFlight = 0;
  return {
    async call(method, params, schema, signal) {
      if (now() - window >= 60000) {
        window = now();
        windowCalls = 0;
      }
      if (now() - totalWindow >= totalWindowMs) {
        totalWindow = now();
        total = 0;
      }
      if (total >= limits.total)
        throw new ProviderFault('rate_limited', Math.max(1000, totalWindowMs - (now() - totalWindow)));
      if (windowCalls >= limits.perMinute || inFlight >= limits.concurrency)
        throw new ProviderFault('rate_limited', Math.max(1000, 60000 - (now() - window)));
      ++windowCalls;
      ++total;
      ++inFlight;
      try {
        return await rpc.call(method, params, schema, signal);
      } finally {
        --inFlight;
      }
    },
  };
}
/** At most2 retries; each attempt consumes its budget, cancellation stops waits. */
export function retryingTransport(rpc: RpcTransport): RpcTransport {
  return {
    async call(method, params, schema, signal) {
      for (let attempt = 0; ; attempt++) {
        try {
          return await rpc.call(method, params, schema, signal);
        } catch (error) {
          if (
            !(error instanceof ProviderFault) ||
            attempt >= 2 ||
            signal?.aborted ||
            !['timeout', 'unavailable', 'rate_limited'].includes(error.kind)
          )
            throw error;
          const wait = error.retryAfterMs ?? 25 * 2 ** attempt;
          if (wait > 1000) throw error;
          try {
            await delay(wait, undefined, { signal });
          } catch {
            throw new ProviderFault('timeout');
          }
        }
      }
    },
  };
}
