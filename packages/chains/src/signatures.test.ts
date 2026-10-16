import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getBase58Decoder } from '@solana/kit';
import { privateKeyToAccount } from 'viem/accounts';
import { verifyEvmMessage, verifySolanaMessage } from './signatures.ts';

const message = 'Prove control of this address for Blacklist case #fictional.';

describe('standing message signatures (moderation §6.4)', () => {
  it('accepts an EIP-191 signature only from the signing address and only for that exact text', async () => {
    const account = privateKeyToAccount(`0x${'11'.repeat(32)}`);
    const other = privateKeyToAccount(`0x${'22'.repeat(32)}`);
    const signature = await account.signMessage({ message });
    expect(await verifyEvmMessage(account.address.toLowerCase(), message, signature)).toBe(true);
    expect(await verifyEvmMessage(other.address, message, signature)).toBe(false);
    expect(await verifyEvmMessage(account.address, `${message} `, signature)).toBe(false);
    expect(await verifyEvmMessage(account.address, message, '0x1234')).toBe(false);
  });

  it('accepts a Solana Ed25519 signature only from the signing key and only for that exact text', () => {
    const decoder = getBase58Decoder();
    const pair = generateKeyPairSync('ed25519');
    const raw = pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
    const address = decoder.decode(raw);
    const signature = decoder.decode(sign(null, Buffer.from(message), pair.privateKey));
    expect(verifySolanaMessage(address, message, signature)).toBe(true);
    expect(verifySolanaMessage(address, `${message}!`, signature)).toBe(false);
    const otherRaw = generateKeyPairSync('ed25519')
      .publicKey.export({ format: 'der', type: 'spki' })
      .subarray(-32);
    expect(verifySolanaMessage(decoder.decode(otherRaw), message, signature)).toBe(false);
    expect(verifySolanaMessage('not-base58-0OIl', message, signature)).toBe(false);
  });
});
