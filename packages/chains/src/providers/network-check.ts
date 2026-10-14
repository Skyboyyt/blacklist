import { z } from 'zod';
import { ProviderFault, type RpcTransport } from './rpc-transport.ts';

/** Cache only successful identity checks; cancellation belongs to each subscriber. */
export function createNetworkCheck(rpc: RpcTransport, method: string, identity: string) {
  let verified = false;
  let active: { controller: AbortController; promise: Promise<void>; consumers: number } | undefined;
  return async (signal?: AbortSignal): Promise<void> => {
    if (signal?.aborted) throw new ProviderFault('timeout');
    if (verified) return;
    if (!active || active.controller.signal.aborted) {
      const controller = new AbortController();
      const entry = { controller, consumers: 0, promise: Promise.resolve() };
      active = entry;
      const deadline = AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]);
      entry.promise = rpc
        .call(method, [], z.literal(identity), deadline)
        .then(() => {
          if (deadline.aborted) throw new ProviderFault('timeout');
          verified = true;
        })
        .finally(() => {
          if (active === entry) active = undefined;
        });
    }
    const entry = active;
    ++entry.consumers;
    await new Promise<void>((resolve, reject) => {
      let finished = false;
      const settle = (error?: unknown) => {
        if (finished) return;
        finished = true;
        signal?.removeEventListener('abort', abort);
        --entry.consumers;
        if (!entry.consumers && !verified) entry.controller.abort();
        if (error) reject(error);
        else resolve();
      };
      const abort = () => settle(new ProviderFault('timeout'));
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      entry.promise.then(
        () => settle(),
        (error: unknown) => settle(error),
      );
    });
  };
}
