import { afterEach, describe, it, expect, vi } from 'vitest';
import { base58, signStandingMessage } from './wallet-sign';

afterEach(() => vi.unstubAllGlobals());
const address = '0x' + 'ab'.repeat(20);

describe('standing message signing (moderation §6.4)', () => {
  it('asks an EVM wallet for personal_sign only, from the subject address', async () => {
    const request = vi.fn(async ({ method }: { method: string }) =>
      method === 'eth_requestAccounts' ? [address.toUpperCase().replace('0X', '0x')] : '0xsig',
    );
    vi.stubGlobal('ethereum', { request });
    expect(await signStandingMessage('ethereum', address, 'Hi')).toEqual({
      kind: 'signed',
      signature: '0xsig',
    });
    expect(request.mock.calls.map(([a]) => a.method)).toEqual(['eth_requestAccounts', 'personal_sign']);
    expect(request.mock.calls[1]?.[0]).toMatchObject({
      params: ['0x4869', address.toUpperCase().replace('0X', '0x')],
    });
  });

  it('refuses a wallet that does not control the subject address, without signing', async () => {
    const request = vi.fn(async () => ['0x' + 'cd'.repeat(20)]);
    vi.stubGlobal('ethereum', { request });
    expect(await signStandingMessage('ethereum', address, 'Hi')).toMatchObject({ kind: 'error' });
    expect(request).toHaveBeenCalledTimes(1);
    vi.stubGlobal('ethereum', undefined);
    expect(await signStandingMessage('ethereum', address, 'Hi')).toMatchObject({ kind: 'error' });
  });

  it('signs with a Solana wallet only when the connected key is the subject', async () => {
    const signMessage = vi.fn(async () => ({ signature: new Uint8Array([0, 1, 2]) }));
    vi.stubGlobal('solana', {
      connect: async () => ({ publicKey: { toString: () => 'Fict1onal' } }),
      signMessage,
    });
    expect(await signStandingMessage('solana', 'Fict1onal', 'Hi')).toEqual({
      kind: 'signed',
      signature: base58(new Uint8Array([0, 1, 2])),
    });
    expect(await signStandingMessage('solana', 'Other1', 'Hi')).toMatchObject({ kind: 'error' });
    expect(signMessage).toHaveBeenCalledTimes(1);
  });

  it('encodes base58 like Solana, including leading zero bytes', () => {
    expect(base58(new Uint8Array([0, 0, 1]))).toBe('112');
    expect(base58(new Uint8Array([255]))).toBe('5Q');
  });
});
