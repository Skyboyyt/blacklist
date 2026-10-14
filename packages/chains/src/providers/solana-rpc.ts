import { z } from 'zod';
import type { ChainAddress, ChainTxRef } from '@blacklist/core';
import type {
  AccountInfoSource,
  TransactionSource,
  AddressHistorySource,
  BalanceSource,
  TokenMetadataSource,
  ProviderCapability,
  ProviderCallOptions,
} from '../ports.ts';
import type {
  AccountInfo,
  NormalizedTransaction,
  Sourced,
  ChainSnapshot,
  Page,
  TransactionSummary,
  TokenInfo,
  TokenBalance,
} from '../types.ts';
import { registry } from '../registry.ts';
import { solanaAdapter } from '../adapters/identity.ts';
import {
  uint,
  solAddress,
  solanaTransactionSchema,
  decodeSolanaTransaction,
  TOKEN_PROGRAM,
  TOKEN_2022,
} from '../adapters/solana-transaction.ts';
import { ProviderFault, type RpcTransport } from './rpc-transport.ts';
import { readReceipt, providerFieldsDigest } from './read-receipt.ts';
const chain = registry.bySlug('solana');
if (!chain) throw new Error('mainnet_registry_missing');
const solanaId = chain.chainId;
const context = z.object({ slot: uint });
const account = z.object({ lamports: uint, owner: solAddress, executable: z.boolean(), data: z.unknown() });
const mintInfo = z.object({
  type: z.literal('mint'),
  info: z.object({
    decimals: z.number().int().min(0).max(255),
    supply: uint,
    mintAuthority: solAddress.nullable(),
    freezeAuthority: solAddress.nullable(),
  }),
});
const parsedData = z.object({ parsed: z.unknown() });
const tokenAccount = z.object({
  parsed: z.object({
    type: z.literal('account'),
    info: z.object({
      mint: solAddress,
      tokenAmount: z.object({ amount: uint, decimals: z.number().int().min(0).max(255) }),
    }),
  }),
});
const signatures = z
  .array(
    z.object({
      signature: z.string().refine((v) => solanaAdapter.parseTxHash(v) !== null),
      slot: uint,
      err: z.unknown().refine((v) => v !== undefined),
      blockTime: z.number().int().nonnegative().max(8640000000000).nullable(),
    }),
  )
  .max(100);
function config(options: ProviderCallOptions) {
  if (!['confirmed', 'finalized'].includes(options.commitment)) throw new ProviderFault('not_supported');
  const slot = options.minContextSlot === undefined ? undefined : BigInt(options.minContextSlot);
  if (slot !== undefined && (slot < 0n || slot > BigInt(Number.MAX_SAFE_INTEGER)))
    throw new ProviderFault('not_supported');
  return {
    commitment: options.commitment,
    encoding: 'jsonParsed',
    ...(slot !== undefined ? { minContextSlot: Number(slot) } : {}),
  };
}
export function createSolanaRpcSource(
  id: string,
  independenceGroup: string,
  rpc: RpcTransport,
  completeTransactionHistory = false,
): AccountInfoSource & TransactionSource & AddressHistorySource & BalanceSource & TokenMetadataSource {
  let identity: Promise<void> | undefined;
  const network = () =>
    (identity ??= rpc
      .call('getGenesisHash', [], z.literal('5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'))
      .then(() => undefined)
      .catch((error: unknown) => {
        identity = undefined;
        throw error;
      }));
  const provenance = (snapshot: ChainSnapshot, options: ProviderCallOptions) => ({
    providerId: id,
    fetchedAt: new Date(),
    snapshot,
    finality: options.commitment === 'finalized' ? ('final' as const) : ('pending' as const),
    decoderVersion: 'solana-rpc-v1',
    verification: 'single_source' as const,
    degraded: false,
  });
  async function read(ref: ChainAddress, options: ProviderCallOptions) {
    if (ref.chainId !== solanaId || !solanaAdapter.parseAddress(ref.address))
      throw new ProviderFault('not_supported');
    await network();
    const result = await rpc.call(
      'getAccountInfo',
      [ref.address, config(options)],
      z.object({ context, value: account.nullable() }),
      options.signal,
    );
    if (options.minContextSlot && BigInt(result.context.slot) < BigInt(options.minContextSlot))
      throw new ProviderFault('invalid_response');
    return result;
  }
  return {
    id,
    independenceGroup,
    supports: (chainId, capability: ProviderCapability) =>
      chainId === solanaId &&
      ['account_info', 'transaction', 'address_history', 'balances', 'token_metadata'].includes(capability),
    async fetchAccountInfo(
      ref: ChainAddress,
      options: ProviderCallOptions,
    ): Promise<Sourced<AccountInfo | null>> {
      const requestedAt = new Date(),
        result = await read(ref, options);
      const parsed = result.value
        ? mintInfo.safeParse(parsedData.safeParse(result.value.data).data?.parsed)
        : null;
      const snapshot: ChainSnapshot = { kind: 'solana_context', contextSlot: result.context.slot },
        source = provenance(snapshot, options);
      return {
        data: result.value
          ? {
              chainId: ref.chainId,
              address: ref.address,
              nativeBalanceRaw: result.value.lamports,
              kind: result.value.executable
                ? 'program'
                : parsed?.success && [TOKEN_PROGRAM, TOKEN_2022].includes(result.value.owner)
                  ? 'token_mint'
                  : 'unknown',
            }
          : null,
        provenance: {
          ...source,
          receipts: [
            readReceipt({
              chainId: ref.chainId,
              providerId: id,
              independenceGroup,
              capability: 'account_info',
              method: 'getAccountInfo',
              subject: ref.address,
              params: {
                address: ref.address,
                encoding: 'jsonParsed',
                ...(options.minContextSlot ? { minContextSlot: options.minContextSlot } : {}),
              },
              commitment: options.commitment,
              snapshot,
              finality: source.finality,
              requestedAt,
              fetchedAt: source.fetchedAt,
              normalizedFields: {
                account: result.value
                  ? {
                      lamports: result.value.lamports,
                      owner: result.value.owner,
                      executable: result.value.executable,
                      dataDigest: providerFieldsDigest(result.value.data),
                    }
                  : null,
              },
              decoderVersion: 'solana-rpc-v1',
              comparisonSpecVersion: 'solana-account-v1',
            }),
          ],
        },
      };
    },
    async fetchTransaction(
      ref: ChainTxRef,
      options: ProviderCallOptions,
    ): Promise<Sourced<NormalizedTransaction | null>> {
      if (ref.chainId !== solanaId || !solanaAdapter.parseTxHash(ref.txHash))
        throw new ProviderFault('not_supported');
      const requestedAt = new Date();
      await network();
      config(options);
      const result = await rpc.call(
        'getTransaction',
        [
          ref.txHash,
          { commitment: options.commitment, encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
        ],
        solanaTransactionSchema.nullable(),
        options.signal,
      );
      if (!result) {
        if (!completeTransactionHistory) throw new ProviderFault('history_pruned');
        const slot = await rpc.call('getSlot', [{ commitment: options.commitment }], uint, options.signal);
        return { data: null, provenance: provenance({ kind: 'solana_context', contextSlot: slot }, options) };
      }
      const snapshot: ChainSnapshot = {
          kind: 'solana_transaction',
          signature: ref.txHash,
          slot: result.slot,
        },
        source = provenance(snapshot, options);
      const data = decodeSolanaTransaction(ref.chainId, ref.txHash, result);
      return {
        data,
        provenance: {
          ...source,
          receipts: [
            readReceipt({
              chainId: ref.chainId,
              providerId: id,
              independenceGroup,
              capability: 'transaction',
              method: 'getTransaction',
              subject: ref.txHash,
              params: {
                transaction: ref.txHash,
                encoding: 'jsonParsed',
                maxSupportedTransactionVersion: '0',
              },
              commitment: options.commitment,
              snapshot,
              finality: source.finality,
              requestedAt,
              fetchedAt: source.fetchedAt,
              normalizedFields: {
                execution: {
                  txHash: data.txHash,
                  block: data.block,
                  status: data.status,
                  feeRaw: data.feeRaw,
                },
                normalizedTransaction: { ...data, blockTime: data.blockTime?.toISOString() ?? null },
                signature: ref.txHash,
                slot: result.slot,
                errorDigest: providerFieldsDigest(result.meta?.err),
                feeRaw: result.meta?.fee,
                preBalances: result.meta?.preBalances,
                postBalances: result.meta?.postBalances,
                preTokenBalances: result.meta?.preTokenBalances ?? [],
                postTokenBalances: result.meta?.postTokenBalances ?? [],
                instructionDigest: providerFieldsDigest(result.transaction.message.instructions),
                innerInstructionDigest: providerFieldsDigest(result.meta?.innerInstructions ?? []),
              },
              decoderVersion: 'solana-rpc-v1',
              comparisonSpecVersion: 'solana-transaction-v1',
            }),
          ],
        },
      };
    },
    async fetchAddressHistory(
      ref: ChainAddress,
      query: { cursor: string | null; limit: number; direction: 'in' | 'out' | 'all' },
      options: ProviderCallOptions,
    ): Promise<Sourced<Page<TransactionSummary>>> {
      if (
        ref.chainId !== solanaId ||
        !['in', 'out', 'all'].includes(query.direction) ||
        !Number.isInteger(query.limit) ||
        query.limit < 1 ||
        query.limit > (query.direction === 'all' ? 100 : 25) ||
        (query.cursor !== null && !solanaAdapter.parseTxHash(query.cursor))
      )
        throw new ProviderFault('not_supported');
      await network();
      const cfg = config(options);
      const rows = await rpc.call(
        'getSignaturesForAddress',
        [
          ref.address,
          {
            commitment: cfg.commitment,
            limit: query.limit,
            ...(cfg.minContextSlot !== undefined ? { minContextSlot: cfg.minContextSlot } : {}),
            ...(query.cursor ? { before: query.cursor } : {}),
          },
        ],
        signatures,
        options.signal,
      );
      const slot = await rpc.call('getSlot', [{ commitment: cfg.commitment }], uint, options.signal);
      if (
        rows.length > query.limit ||
        new Set(rows.map((row) => row.signature)).size !== rows.length ||
        rows.some(
          (row, index) =>
            BigInt(row.slot) > BigInt(slot) ||
            (index > 0 && BigInt(row.slot) > BigInt(rows[index - 1]?.slot ?? '0')),
        ) ||
        (options.minContextSlot && BigInt(slot) < BigInt(options.minContextSlot))
      )
        throw new ProviderFault('invalid_response');
      const items: TransactionSummary[] = [];
      for (const row of rows) {
        const txHash = solanaAdapter.parseTxHash(row.signature);
        if (!txHash) throw new ProviderFault('invalid_response');
        let direction: TransactionSummary['direction'] = 'other';
        if (query.direction !== 'all') {
          const transaction = await rpc.call(
            'getTransaction',
            [
              txHash,
              { commitment: cfg.commitment, encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
            ],
            solanaTransactionSchema.nullable(),
            options.signal,
          );
          if (!transaction) throw new ProviderFault('history_pruned');
          const decoded = decodeSolanaTransaction(ref.chainId, txHash, transaction);
          if (decoded.block !== row.slot || decoded.status !== (row.err === null ? 'success' : 'failed'))
            throw new ProviderFault('invalid_response');
          const incoming = decoded.transfers.some((t) => t.to === ref.address),
            outgoing = decoded.transfers.some((t) => t.from === ref.address);
          direction = incoming && outgoing ? 'self' : incoming ? 'in' : outgoing ? 'out' : 'other';
          if (direction !== query.direction && direction !== 'self') continue;
        }
        items.push({
          chainId: ref.chainId,
          txHash,
          block: row.slot,
          blockTime: row.blockTime === null ? null : new Date(row.blockTime * 1000),
          status: row.err === null ? 'success' : 'failed',
          direction,
        });
      }
      return {
        data: {
          items,
          nextCursor: rows.length === query.limit ? (rows.at(-1)?.signature ?? null) : null,
          truncated: true,
        },
        provenance: provenance({ kind: 'solana_context', contextSlot: slot }, options),
      };
    },
    async fetchBalances(
      ref: ChainAddress,
      options: ProviderCallOptions,
    ): Promise<Sourced<readonly TokenBalance[]>> {
      if (ref.chainId !== solanaId) throw new ProviderFault('not_supported');
      await network();
      const page = await rpc.call(
        'getTokenAccountsByOwner',
        [ref.address, { programId: TOKEN_PROGRAM }, config(options)],
        z.object({
          context,
          value: z
            .array(z.object({ account: z.object({ owner: z.literal(TOKEN_PROGRAM), data: tokenAccount }) }))
            .max(100),
        }),
        options.signal,
      );
      // This method returns only SPL Token accounts. Token2022 requires a separate read at the same context slot.
      // Do not silently fabricate a complete combined balance list.
      const balances = new Map<string, TokenBalance>();
      if (options.minContextSlot && BigInt(page.context.slot) < BigInt(options.minContextSlot))
        throw new ProviderFault('invalid_response');
      for (const item of page.value) {
        const info = item.account.data.parsed.info,
          token = solanaAdapter.parseAddress(info.mint);
        if (!token) throw new ProviderFault('invalid_response');
        const prior = balances.get(token);
        if (prior && prior.decimals !== info.tokenAmount.decimals)
          throw new ProviderFault('invalid_response');
        balances.set(token, {
          token,
          amountRaw: (BigInt(prior?.amountRaw ?? '0') + BigInt(info.tokenAmount.amount)).toString(),
          decimals: info.tokenAmount.decimals,
        });
      }
      return {
        data: [...balances.values()],
        provenance: provenance({ kind: 'solana_context', contextSlot: page.context.slot }, options),
      };
    },
    async fetchTokenInfo(
      ref: ChainAddress,
      options: ProviderCallOptions,
    ): Promise<Sourced<TokenInfo | null>> {
      const requestedAt = new Date(),
        result = await read(ref, options),
        data = parsedData.safeParse(result.value?.data);
      // Token2022 extensions need a complete decoder before metadata can claim their absence.
      if (result.value?.owner === TOKEN_2022) throw new ProviderFault('not_supported');
      const parsed = mintInfo.safeParse(data.success ? data.data.parsed : null);
      if (!result.value || !parsed.success || ![TOKEN_PROGRAM, TOKEN_2022].includes(result.value.owner))
        return {
          data: null,
          provenance: provenance({ kind: 'solana_context', contextSlot: result.context.slot }, options),
        };
      const info = parsed.data.info;
      const snapshot: ChainSnapshot = { kind: 'solana_context', contextSlot: result.context.slot },
        source = provenance(snapshot, options);
      return {
        data: {
          chainId: ref.chainId,
          address: ref.address,
          standard: result.value.owner === TOKEN_PROGRAM ? 'spl' : 'spl_token_2022',
          nameOnchain: null,
          symbolOnchain: null,
          decimals: info.decimals,
          totalSupplyRaw: info.supply,
          mintAuthority: info.mintAuthority ? solanaAdapter.parseAddress(info.mintAuthority) : null,
          freezeAuthority: info.freezeAuthority ? solanaAdapter.parseAddress(info.freezeAuthority) : null,
          extensions: {},
        },
        provenance: {
          ...source,
          receipts: [
            readReceipt({
              chainId: ref.chainId,
              providerId: id,
              independenceGroup,
              capability: 'token_metadata',
              method: 'getAccountInfo',
              subject: ref.address,
              params: {
                address: ref.address,
                encoding: 'jsonParsed',
                ...(options.minContextSlot ? { minContextSlot: options.minContextSlot } : {}),
              },
              commitment: options.commitment,
              snapshot,
              finality: source.finality,
              requestedAt,
              fetchedAt: source.fetchedAt,
              normalizedFields: { owner: result.value.owner, mint: info },
              decoderVersion: 'solana-rpc-v1',
              comparisonSpecVersion: 'solana-token-v1',
            }),
          ],
        },
      };
    },
  };
}
