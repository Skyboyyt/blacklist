import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { budgetedTransport, retryingTransport } from './policy.ts';
import { ProviderFault, type RpcTransport } from './rpc-transport.ts';
describe('provider request budgets and retries', () => {
  it('counts every request, restores concurrency and does not reset total budget when window advances', async () => {
    let now = 0;
    const fn = vi.fn().mockResolvedValue(1),
      rpc = budgetedTransport(
        { call: fn } as RpcTransport,
        { perMinute: 1, total: 2, concurrency: 1 },
        () => now,
      );
    await rpc.call('getSlot', [], z.number());
    await expect(rpc.call('getSlot', [], z.number())).rejects.toMatchObject({ kind: 'rate_limited' });
    now = 60000;
    await rpc.call('getSlot', [], z.number());
    now = 120000;
    await expect(rpc.call('getSlot', [], z.number())).rejects.toMatchObject({ kind: 'rate_limited' });
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it('restores the total budget once its window has passed', async () => {
    let now = 0;
    const fn = vi.fn().mockResolvedValue(1),
      rpc = budgetedTransport(
        { call: fn } as RpcTransport,
        { perMinute: 10, total: 1, concurrency: 1, totalWindowMs: 3_600_000 },
        () => now,
      );
    await rpc.call('getSlot', [], z.number());
    await expect(rpc.call('getSlot', [], z.number())).rejects.toMatchObject({
      kind: 'rate_limited',
      retryAfterMs: 3_600_000,
    });
    now = 3_600_000;
    await rpc.call('getSlot', [], z.number());
    expect(fn).toHaveBeenCalledTimes(2);
    expect(() =>
      budgetedTransport({ call: fn } as RpcTransport, {
        perMinute: 1,
        total: 1,
        concurrency: 1,
        totalWindowMs: 0,
      }),
    ).toThrow('provider_budget_invalid');
  });
  it('caps transient retries at2 and refuses waits beyond the bounded retry budget', async () => {
    const fn = vi.fn().mockRejectedValue(new ProviderFault('unavailable')),
      retry = retryingTransport({ call: fn } as RpcTransport);
    await expect(retry.call('getSlot', [], z.number())).rejects.toMatchObject({ kind: 'unavailable' });
    expect(fn).toHaveBeenCalledTimes(3);
    const rate = vi.fn().mockRejectedValue(new ProviderFault('rate_limited', 60000));
    await expect(
      retryingTransport({ call: rate } as RpcTransport).call('getSlot', [], z.number()),
    ).rejects.toMatchObject({ kind: 'rate_limited' });
    expect(rate).toHaveBeenCalledTimes(1);
    const invalid = vi.fn().mockRejectedValue(new ProviderFault('invalid_response'));
    await expect(
      retryingTransport({ call: invalid } as RpcTransport).call('getSlot', [], z.number()),
    ).rejects.toMatchObject({ kind: 'invalid_response' });
    expect(invalid).toHaveBeenCalledTimes(1);
  });
});
