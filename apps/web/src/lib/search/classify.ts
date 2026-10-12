/**
 * Format detection for the universal search box.
 *
 * This is a UX hint only (it shapes what the user sees while typing). It does
 * not validate checksums or decode base58; the API classifies and validates
 * every query again and is the only authority.
 */
import { SEARCH_QUERY_MAX_LENGTH, type ChainSlugDto } from '@blacklist/contracts';

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

export type Classification =
  | { readonly kind: 'empty' }
  | { readonly kind: 'address'; readonly chains: readonly ChainSlugDto[]; readonly normalized: string }
  | { readonly kind: 'transaction'; readonly chain: ChainSlugDto; readonly normalized: string }
  /** Could be an address on more than one network: the user must choose. */
  | { readonly kind: 'ambiguous_address'; readonly candidates: readonly ChainSlugDto[] }
  | { readonly kind: 'unsupported'; readonly network: string }
  | { readonly kind: 'invalid'; readonly reason: string };

export function classifyInput(raw: string): Classification {
  const value = raw.trim();
  if (value.length === 0) return { kind: 'empty' };
  if (value.length > SEARCH_QUERY_MAX_LENGTH) {
    return { kind: 'invalid', reason: 'That is too long to be an address or transaction hash.' };
  }

  if (/^0x/i.test(value)) {
    if (/^0x[0-9a-f]{40}$/i.test(value)) {
      return { kind: 'address', chains: ['ethereum'], normalized: value.toLowerCase() };
    }
    if (/^0x[0-9a-f]{64}$/i.test(value)) {
      return { kind: 'transaction', chain: 'ethereum', normalized: value.toLowerCase() };
    }
    return {
      kind: 'invalid',
      reason: 'Ethereum addresses are 0x followed by 40 hex characters; transaction hashes have 64.',
    };
  }

  // 40 hex characters without 0x: an EVM address missing its prefix, and possibly
  // also a valid-looking Solana address. Never guess: ask.
  if (/^[0-9a-f]{40}$/i.test(value)) {
    return BASE58.test(value)
      ? { kind: 'ambiguous_address', candidates: ['ethereum', 'solana'] }
      : { kind: 'address', chains: ['ethereum'], normalized: `0x${value.toLowerCase()}` };
  }

  if (/^bc1[0-9a-z]{8,87}$/i.test(value)) return { kind: 'unsupported', network: 'Bitcoin' };
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.(eth|sol)$/i.test(value)) {
    return { kind: 'unsupported', network: 'Name services (.eth, .sol)' };
  }

  // Solana is case-sensitive: never lowercase.
  if (BASE58.test(value)) {
    if (value.length >= 32 && value.length <= 44) {
      return { kind: 'address', chains: ['solana'], normalized: value };
    }
    if (value.length >= 86 && value.length <= 88) {
      return { kind: 'transaction', chain: 'solana', normalized: value };
    }
  }

  return { kind: 'invalid', reason: 'Enter a wallet address, contract address or transaction hash.' };
}
