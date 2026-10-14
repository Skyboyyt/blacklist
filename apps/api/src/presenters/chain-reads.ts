import {
  addressHistorySchema,
  tokenResearchSchema,
  contractResearchSchema,
  tokenBalancesSchema,
  type ChainSlugDto,
} from '@blacklist/contracts';
import {
  readResearchHistory,
  readResearchToken,
  readResearchContract,
  readResearchBalances,
  type ResearchContext,
  type Actor,
  type ResearchReadOptions,
  type ResearchHistoryQuery,
  type ResearchProvenance,
} from '@blacklist/domain';
import { publicResearchSource } from './source.ts';
const source = (chain: ChainSlugDto, value: ResearchProvenance) => ({
  chain,
  source: publicResearchSource(chain, value),
  fetchedAt: value.fetchedAt.toISOString(),
  snapshot: value.snapshot,
  finality: value.finality,
  verification: value.verification,
  degraded: value.degraded,
});
const unavailable = (kind: string) => ({
  kind: 'provider_unavailable' as const,
  retryAfterSeconds: 30,
  reason:
    kind === 'data_conflict'
      ? 'under_verification'
      : ['rate_limited', 'history_pruned', 'not_supported', 'timeout'].includes(kind)
        ? kind
        : 'unavailable',
});
export async function historyResearch(
  ctx: ResearchContext,
  actor: Actor | null,
  chain: ChainSlugDto,
  address: string,
  query: ResearchHistoryQuery,
) {
  const read = await readResearchHistory(ctx, actor, chain, address, query);
  if (!read.result.ok) return unavailable(read.result.error.kind);
  const { data, provenance } = read.result.value;
  return {
    kind: 'found' as const,
    data: addressHistorySchema.parse({
      chain,
      address: read.ref.address,
      source: source(chain, provenance),
      items: data.items.map((item) => ({
        hash: item.txHash,
        block: item.block,
        at: item.blockTime?.toISOString() ?? null,
        status: item.status,
        direction: item.direction,
      })),
      nextCursor: data.nextCursor,
      truncated: data.truncated,
      restarted: data.restarted ?? false,
      coverage:
        chain === 'solana'
          ? 'Address signature activity only; associated token accounts and transfer direction are not fully indexed. Missing activity is not proof of absence.'
          : 'Directional indexed transfer activity only; failed calls without transfers and internal/native movements may be omitted. Missing activity is not proof of absence.',
    }),
  };
}
export async function tokenResearch(
  ctx: ResearchContext,
  actor: Actor | null,
  chain: ChainSlugDto,
  address: string,
  options: ResearchReadOptions,
) {
  const read = await readResearchToken(ctx, actor, chain, address, options);
  if (!read.result.ok) return unavailable(read.result.error.kind);
  const { data, provenance } = read.result.value;
  if (!data) return { kind: 'not_found' as const };
  return {
    kind: 'found' as const,
    data: tokenResearchSchema.parse({
      chain,
      address: read.ref.address,
      source: source(chain, provenance),
      standard: data.standard,
      nameOnchain: data.nameOnchain,
      symbolOnchain: data.symbolOnchain,
      decimals: data.decimals,
      totalSupplyRaw: data.totalSupplyRaw,
      mintAuthority: data.mintAuthority,
      freezeAuthority: data.freezeAuthority,
      coverage:
        'Supported on-chain ERC20 or classic SPL mint fields only. Creator names are untrusted; no external metadata URLs were fetched.',
    }),
  };
}
export async function contractResearch(
  ctx: ResearchContext,
  actor: Actor | null,
  chain: ChainSlugDto,
  address: string,
  options: ResearchReadOptions,
) {
  const read = await readResearchContract(ctx, actor, chain, address, options);
  if (!read.result.ok) return unavailable(read.result.error.kind);
  const { data, provenance } = read.result.value;
  if (!data) return { kind: 'not_found' as const };
  return {
    kind: 'found' as const,
    data: contractResearchSchema.parse({
      chain,
      address: read.ref.address,
      source: source(chain, provenance),
      bytecodeHash: data.bytecodeHash,
      sourceVerification: 'unknown',
      coverage:
        'On-chain bytecode only; explorer source verification, deployment history and proxy authorities are unavailable.',
    }),
  };
}
export async function balanceResearch(
  ctx: ResearchContext,
  actor: Actor | null,
  chain: ChainSlugDto,
  address: string,
  options: ResearchReadOptions,
) {
  const read = await readResearchBalances(ctx, actor, chain, address, options);
  if (!read.result.ok) return unavailable(read.result.error.kind);
  const { data, provenance } = read.result.value;
  return {
    kind: 'found' as const,
    data: tokenBalancesSchema.parse({
      chain,
      address: read.ref.address,
      source: source(chain, provenance),
      balances: data,
      coverage:
        chain === 'ethereum'
          ? 'Up to10discovered ERC20-compatible assets from one indexer page; amounts/decimals use the same canonical block. Inventory is incomplete. Native balance is separate.'
          : 'Classic SPL Token program only; Token2022 and other asset balances are not included. Native balance is returned separately.',
    }),
  };
}
