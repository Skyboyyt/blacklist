import { createPublicKey, verify } from 'node:crypto';
import { getBase58Encoder } from '@solana/kit';
import { recoverMessageAddress, isHex } from 'viem';

// Off-chain message signatures for standing (moderation §6.4). Only EIP-191 `personal_sign`
// and Solana Ed25519 message signatures are accepted: never eth_sign, typed data or any
// transaction signature (AGENTS §5.5). Contract wallets (EIP-1271) are not supported in V1;
// they use documentary standing instead.

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/** True only when `signature` is an EIP-191 signature of `message` by the EOA `address`. */
export async function verifyEvmMessage(address: string, message: string, signature: string) {
  if (!isHex(signature) || signature.length !== 132) return false;
  try {
    const recovered = await recoverMessageAddress({ message, signature });
    return recovered.toLowerCase() === address.toLowerCase();
  } catch {
    return false;
  }
}

/** True only when `signature` (base58) is an Ed25519 signature of `message` by `address`. */
export function verifySolanaMessage(address: string, message: string, signature: string) {
  try {
    const encoder = getBase58Encoder();
    const publicKey = Buffer.from(encoder.encode(address));
    const signatureBytes = Buffer.from(encoder.encode(signature));
    if (publicKey.length !== 32 || signatureBytes.length !== 64) return false;
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, publicKey]),
      format: 'der',
      type: 'spki',
    });
    return verify(null, Buffer.from(message, 'utf8'), key, signatureBytes);
  } catch {
    return false;
  }
}
