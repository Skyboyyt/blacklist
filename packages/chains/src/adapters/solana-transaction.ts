import { z } from 'zod';
import type { Address, ChainId, TxHash } from '@blacklist/core';
import type { AssetTransfer, NormalizedTransaction } from '../types.ts';
import { solanaAdapter } from './identity.ts';
import { ProviderFault } from '../providers/rpc-transport.ts';
export const uint = z
  .union([
    z.number().int().safe().nonnegative(),
    z
      .string()
      .regex(/^(0|[1-9]\d*)$/u)
      .max(78),
  ])
  .transform(String);
export const solAddress = z.string().refine((value) => solanaAdapter.parseAddress(value) !== null);
const instruction = z.object({
  programId: solAddress,
  parsed: z.object({ type: z.string().max(64), info: z.unknown() }).optional(),
  data: z.string().max(131072).optional(),
  accounts: z.array(solAddress).max(1024).optional(),
});
const tokenBalance = z.object({
  accountIndex: z.number().int().min(0).max(1023),
  mint: solAddress,
  owner: solAddress.optional(),
  uiTokenAmount: z.object({
    amount: z
      .string()
      .regex(/^(0|[1-9]\d*)$/u)
      .max(78),
    decimals: z.number().int().min(0).max(255),
  }),
});
export const solanaTransactionSchema = z.object({
  slot: uint,
  blockTime: z.number().int().nonnegative().max(8640000000000).nullable(),
  version: z.union([z.literal('legacy'), z.literal(0)]).optional(),
  transaction: z.object({
    signatures: z
      .array(z.string().refine((v) => solanaAdapter.parseTxHash(v) !== null))
      .min(1)
      .max(64),
    message: z.object({
      accountKeys: z
        .array(z.object({ pubkey: solAddress, signer: z.boolean(), writable: z.boolean() }))
        .min(1)
        .max(1024),
      instructions: z.array(instruction).max(1000),
    }),
  }),
  meta: z
    .object({
      err: z.unknown().refine((v) => v !== undefined),
      fee: uint,
      preBalances: z.array(uint).max(1024),
      postBalances: z.array(uint).max(1024),
      preTokenBalances: z.array(tokenBalance).max(1024).optional(),
      postTokenBalances: z.array(tokenBalance).max(1024).optional(),
      innerInstructions: z
        .array(
          z.object({ index: z.number().int().min(0).max(999), instructions: z.array(instruction).max(1000) }),
        )
        .max(1000)
        .nullable()
        .optional(),
    })
    .nullable(),
});
const SYSTEM = '11111111111111111111111111111111';
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const tokenInfo = z.object({
  source: solAddress,
  destination: solAddress,
  authority: solAddress.optional(),
  mint: solAddress.optional(),
  amount: z
    .string()
    .regex(/^(0|[1-9]\d*)$/u)
    .max(78)
    .optional(),
  tokenAmount: z
    .object({
      amount: z
        .string()
        .regex(/^(0|[1-9]\d*)$/u)
        .max(78),
    })
    .optional(),
});
const nativeInfo = z.object({ source: solAddress, destination: solAddress, lamports: uint });
const canonical = (value: string): Address => {
  const a = solanaAdapter.parseAddress(value);
  if (!a) throw new ProviderFault('invalid_response');
  return a;
};
/** Uses historical preTokenBalances owners. Signers and fee payer are never substituted for transfer authority. */
export function decodeSolanaTransaction(
  chainId: ChainId,
  signature: TxHash,
  payload: unknown,
): NormalizedTransaction {
  const tx = solanaTransactionSchema.parse(payload),
    meta = tx.meta;
  if (tx.transaction.signatures[0] !== signature) throw new ProviderFault('invalid_response');
  if (!meta || tx.blockTime === null) throw new ProviderFault('unavailable');
  const keys = tx.transaction.message.accountKeys;
  if (meta.preBalances.length !== keys.length || meta.postBalances.length !== keys.length)
    throw new ProviderFault('invalid_response');
  const signers = keys.filter((k) => k.signer).map((k) => canonical(k.pubkey));
  if (
    signers.length !== tx.transaction.signatures.length ||
    new Set(keys.map((k) => k.pubkey)).size !== keys.length
  )
    throw new ProviderFault('invalid_response');
  const all = [
    ...tx.transaction.message.instructions.map((item, index) => ({
      item,
      ordinal: String(index),
      topLevel: true,
    })),
    ...(meta.innerInstructions ?? []).flatMap((group) =>
      group.instructions.map((item, index) => ({
        item,
        ordinal: `${group.index}.${index}`,
        topLevel: false,
      })),
    ),
  ];
  if (all.length > 2000 || new Set(all.map((i) => i.ordinal)).size !== all.length)
    throw new ProviderFault('invalid_response');
  const counts = new Map<string, number>();
  for (const { item } of all) {
    if (
      ![TOKEN_PROGRAM, TOKEN_2022].includes(item.programId) ||
      !['transfer', 'transferChecked'].includes(item.parsed?.type ?? '')
    )
      continue;
    const parsed = tokenInfo.safeParse(item.parsed?.info);
    if (!parsed.success) throw new ProviderFault('invalid_response');
    for (const key of [parsed.data.source, parsed.data.destination])
      counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const transfers: AssetTransfer[] = [];
  if (meta.err === null) {
    for (const { item, ordinal, topLevel } of all) {
      if (!item.parsed) continue;
      if (item.programId === SYSTEM && item.parsed.type === 'transfer') {
        const info = nativeInfo.parse(item.parsed.info),
          from = canonical(info.source),
          to = canonical(info.destination);
        const sourceIndex = keys.findIndex((k) => k.pubkey === from),
          destinationIndex = keys.findIndex((k) => k.pubkey === to);
        if (sourceIndex < 0 || destinationIndex < 0) throw new ProviderFault('invalid_response');
        const amount = BigInt(info.lamports),
          pre = BigInt(meta.preBalances[sourceIndex] ?? '0'),
          post = BigInt(meta.postBalances[destinationIndex] ?? '0');
        if (pre < amount || post < BigInt(meta.preBalances[destinationIndex] ?? '0') + amount) continue;
        transfers.push({
          ordinal,
          from,
          to,
          asset: { kind: 'native' },
          amountRaw: info.lamports,
          transferKind: 'native',
          emitter: canonical(SYSTEM),
          evidenceLevel: 'native_consensus',
          authorization:
            topLevel && signers.includes(from) ? 'subject_signed_direct' : !topLevel ? 'protocol' : 'unknown',
          authority: topLevel && signers.includes(from) ? from : null,
          topLevel,
        });
      } else if (
        [TOKEN_PROGRAM, TOKEN_2022].includes(item.programId) &&
        ['transfer', 'transferChecked'].includes(item.parsed.type)
      ) {
        const info = tokenInfo.parse(item.parsed.info),
          amount = info.amount ?? info.tokenAmount?.amount;
        if (amount === undefined) throw new ProviderFault('invalid_response');
        const sourceIndex = keys.findIndex((k) => k.pubkey === info.source),
          destinationIndex = keys.findIndex((k) => k.pubkey === info.destination);
        const pre = meta.preTokenBalances?.find((b) => b.accountIndex === sourceIndex),
          post = meta.postTokenBalances?.find((b) => b.accountIndex === sourceIndex);
        const destPre = meta.preTokenBalances?.find((b) => b.accountIndex === destinationIndex),
          destPost = meta.postTokenBalances?.find((b) => b.accountIndex === destinationIndex);
        const mint = info.mint ?? pre?.mint;
        if (!mint || !pre || pre.mint !== mint || (post && post.mint !== mint)) continue;
        const from = canonical(info.source),
          to = canonical(info.destination),
          authority = info.authority ? canonical(info.authority) : null;
        const verified =
          counts.get(info.source) === 1 &&
          counts.get(info.destination) === 1 &&
          BigInt(pre.uiTokenAmount.amount) - BigInt(post?.uiTokenAmount.amount ?? '0') === BigInt(amount) &&
          destPost?.mint === mint &&
          (!destPre || destPre.mint === mint) &&
          BigInt(destPost.uiTokenAmount.amount) - BigInt(destPre?.uiTokenAmount.amount ?? '0') ===
            BigInt(amount);
        const owner = pre.owner ? canonical(pre.owner) : null;
        const authorization = !verified
          ? 'unknown'
          : !topLevel
            ? 'protocol'
            : authority && signers.includes(authority) && owner === authority
              ? 'subject_signed_direct'
              : authority && signers.includes(authority) && owner && owner !== authority
                ? 'delegated'
                : 'unknown';
        transfers.push({
          ordinal,
          from,
          to,
          asset: { kind: 'token', address: canonical(mint) },
          amountRaw: amount,
          transferKind: 'fungible',
          emitter: canonical(item.programId),
          evidenceLevel: verified ? 'balance_verified' : 'observed_log',
          authorization,
          authority,
          topLevel,
        });
      }
    }
  }
  return {
    chainId,
    txHash: signature,
    block: tx.slot,
    blockHash: null,
    blockTime: new Date(tx.blockTime * 1000),
    status: meta.err === null ? 'success' : 'failed',
    feeRaw: meta.fee,
    signers,
    transfers,
    invoked: [...new Set(all.map(({ item }) => canonical(item.programId)))],
  };
}
