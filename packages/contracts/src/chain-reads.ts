import { z } from './zod.ts';
import {
  chainSlugSchema,
  isoDateTimeSchema,
  finalitySchema,
  publicSourceSchema,
  untrustedTextSchema,
} from './common.ts';
export const rawChainAmountSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/u)
  .max(78);
export const publicChainSnapshotSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('evm_block'),
    blockNumber: rawChainAmountSchema,
    blockHash: z.string().regex(/^0x[\da-f]{64}$/u),
  }),
  z.strictObject({ kind: z.literal('solana_context'), contextSlot: rawChainAmountSchema }),
  z.strictObject({
    kind: z.literal('solana_transaction'),
    signature: z.string().max(90),
    slot: rawChainAmountSchema,
  }),
]);
export const chainReadSourceSchema = z
  .strictObject({
    chain: chainSlugSchema,
    source: publicSourceSchema,
    fetchedAt: isoDateTimeSchema,
    finality: finalitySchema,
    snapshot: publicChainSnapshotSchema,
    verification: z.enum([
      'agree',
      'conflict',
      'inconclusive_snapshot_mismatch',
      'unavailable',
      'single_source',
    ]),
    degraded: z.boolean(),
  })
  .refine(
    (data) =>
      data.chain === 'ethereum' ? data.snapshot.kind === 'evm_block' : data.snapshot.kind !== 'evm_block',
    { message: 'Snapshot family must match the explicit network.' },
  );
export const addressHistorySchema = z.strictObject({
  chain: chainSlugSchema,
  address: z.string().max(90),
  source: chainReadSourceSchema,
  items: z
    .array(
      z.strictObject({
        hash: z.string().max(90),
        block: rawChainAmountSchema.nullable(),
        at: isoDateTimeSchema.nullable(),
        status: z.enum(['success', 'failed']),
        direction: z.enum(['in', 'out', 'self', 'other']),
      }),
    )
    .max(100),
  nextCursor: z.string().max(2048).nullable(),
  truncated: z.boolean(),
  restarted: z.boolean(),
  coverage: z.string().max(300),
});
export const tokenResearchSchema = z.strictObject({
  chain: chainSlugSchema,
  address: z.string().max(90),
  source: chainReadSourceSchema,
  standard: z.enum(['erc20', 'erc721', 'erc1155', 'spl', 'spl_token_2022', 'unknown']),
  nameOnchain: untrustedTextSchema.nullable(),
  symbolOnchain: untrustedTextSchema.nullable(),
  decimals: z.number().int().min(0).max(255).nullable(),
  totalSupplyRaw: rawChainAmountSchema.nullable(),
  mintAuthority: z.string().max(90).nullable(),
  freezeAuthority: z.string().max(90).nullable(),
  coverage: z.string().max(300),
});
export const contractResearchSchema = z.strictObject({
  chain: chainSlugSchema,
  address: z.string().max(90),
  source: chainReadSourceSchema,
  bytecodeHash: z
    .string()
    .regex(/^0x[\da-f]{64}$/u)
    .nullable(),
  sourceVerification: z.literal('unknown'),
  coverage: z.string().max(300),
});
export const tokenBalancesSchema = z.strictObject({
  chain: chainSlugSchema,
  address: z.string().max(90),
  source: chainReadSourceSchema,
  balances: z
    .array(
      z.strictObject({
        token: z.string().max(90),
        amountRaw: rawChainAmountSchema,
        decimals: z.number().int().min(0).max(255).nullable(),
      }),
    )
    .max(100),
  coverage: z.string().max(300),
});
export type AddressHistory = z.infer<typeof addressHistorySchema>;

/**
 * An exact, human-readable amount from raw base units: `1500000000000000000` with 18
 * decimals is `1.5`. Never rounds; trims trailing zeros; groups thousands with commas.
 */
export function formatTokenAmount(raw: string, decimals: number): string {
  if (!/^(0|[1-9]\d*)$/u.test(raw) || !Number.isInteger(decimals) || decimals < 0 || decimals > 255)
    return raw;
  const padded = raw.padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals).replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
  const fraction = padded.slice(padded.length - decimals).replace(/0+$/u, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

/** Native currency of each supported network, with its decimals. */
export const NATIVE_CURRENCY = {
  ethereum: { symbol: 'ETH', decimals: 18 },
  solana: { symbol: 'SOL', decimals: 9 },
} as const;
