import { describe, it, expect } from 'vitest';
import type { z } from 'zod';
import { createNetworkCheck } from './network-check.ts';
import { ProviderFault, type RpcTransport } from './rpc-transport.ts';

describe('shared mainnet identity cancellation', () => {
  it('stops an aborted subscriber promptly while another completes and caches the check', async () => {
    let complete: (() => void) | undefined;
    let attempts = 0;
    const call: RpcTransport['call'] = async <S extends z.ZodType>(
      _m: string,
      _p: readonly unknown[],
      schema: S,
      signal?: AbortSignal,
    ): Promise<z.output<S>> => {
      ++attempts;
      await new Promise<void>((resolve) => {
        complete = resolve;
      });
      expect(signal?.aborted).toBe(false);
      return schema.parse('0x1');
    };
    const check = createNetworkCheck({ call }, 'eth_chainId', '0x1'),
      controller = new AbortController();
    const first = check(controller.signal),
      second = check();
    controller.abort();
    await expect(first).rejects.toMatchObject({ kind: 'timeout' });
    complete?.();
    await second;
    await check();
    expect(attempts).toBe(1);
  });
  it('cancels underlying work when all subscribers leave and retries a failed handshake', async () => {
    let activeSignal: AbortSignal | undefined;
    const call: RpcTransport['call'] = async <S extends z.ZodType>(
      _m: string,
      _p: readonly unknown[],
      schema: S,
      signal?: AbortSignal,
    ): Promise<z.output<S>> => {
      activeSignal = signal;
      await new Promise<void>((_resolve, reject) =>
        signal?.addEventListener('abort', () => reject(new ProviderFault('timeout')), { once: true }),
      );
      return schema.parse('0x1');
    };
    const rpc: RpcTransport = { call },
      check = createNetworkCheck(rpc, 'eth_chainId', '0x1');
    const controller = new AbortController(),
      result = check(controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ kind: 'timeout' });
    expect(activeSignal?.aborted).toBe(true);
    rpc.call = async (_m, _p, schema) => schema.parse('0x1');
    await check();
  });
  it('refuses pre-cancelled requests and never caches a wrong network or outage', async () => {
    let attempts = 0;
    const call: RpcTransport['call'] = async <S extends z.ZodType>(
      _m: string,
      _p: readonly unknown[],
      schema: S,
    ): Promise<z.output<S>> => {
      ++attempts;
      return schema.parse('0x2');
    };
    const check = createNetworkCheck({ call }, 'eth_chainId', '0x1');
    await expect(check(AbortSignal.abort())).rejects.toMatchObject({ kind: 'timeout' });
    expect(attempts).toBe(0);
    await expect(check()).rejects.toThrow();
    await expect(check()).rejects.toThrow();
    expect(attempts).toBe(2);
  });
});
