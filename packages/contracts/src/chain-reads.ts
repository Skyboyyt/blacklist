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
