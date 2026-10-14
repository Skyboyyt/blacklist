import type { Actor } from '../access/index.ts';
import type { DatabaseRuntime } from '@blacklist/db';
import {
  registry,
  evmAdapter,
  solanaAdapter,
  type ChainDataService,
  type ReadOptions,
  type HistoryQuery,
} from '@blacklist/chains';
import { recordChainRead } from '../chaindata/index.ts';
import { DomainError } from '../shared/errors.ts';
export interface ResearchContext {
  readonly chains: ChainDataService;
  readonly runtime: DatabaseRuntime;
}
export function classifyResearchInput(slug: string, input: string) {
  const chain = registry.bySlug(slug);
  if (!chain) throw new DomainError('invalid_request');
  const adapter = chain.family === 'evm' ? evmAdapter : solanaAdapter;
  return { classification: adapter.classifyInput(input), adapter };
}
export function validateResearchIdentifier(slug: string, input: string, kind: 'address' | 'transaction') {
  const { adapter } = classifyResearchInput(slug, input);
  if (!(kind === 'address' ? adapter.parseAddress(input) : adapter.parseTxHash(input)))
    throw new DomainError('invalid_request');
}
export function researchAddress(
  ctx: ResearchContext,
  _actor: Actor | null,
  chainSlug: string,
  input: string,
) {
  const chain = ctx.chains.registry.bySlug(chainSlug);
  if (!chain) throw new DomainError('invalid_request');
  const address = ctx.chains.adapterFor(chain.chainId).parseAddress(input);
  if (!address) throw new DomainError('invalid_request');
  return { chain, ref: { chainId: chain.chainId, address } };
}
export function researchTransaction(
  ctx: ResearchContext,
  _actor: Actor | null,
  chainSlug: string,
  input: string,
) {
  const chain = ctx.chains.registry.bySlug(chainSlug);
  if (!chain) throw new DomainError('invalid_request');
  const txHash = ctx.chains.adapterFor(chain.chainId).parseTxHash(input);
  if (!txHash) throw new DomainError('invalid_request');
  return { chain, ref: { chainId: chain.chainId, txHash } };
}
export async function readResearchAddress(
  ctx: ResearchContext,
  actor: Actor | null,
  slug: string,
  input: string,
  options: ReadOptions = {},
) {
  const { chain, ref } = researchAddress(ctx, actor, slug, input),
    result = await ctx.chains.getAccountInfo(ref, options);
  if (result.ok) await recordChainRead(ctx.runtime, 'account_info', ref.address, result.value);
  return { chain, ref, result };
}
export async function readResearchTransaction(
  ctx: ResearchContext,
  actor: Actor | null,
  slug: string,
  input: string,
  options: ReadOptions = {},
) {
  const { chain, ref } = researchTransaction(ctx, actor, slug, input),
    result = await ctx.chains.getTransaction(ref, options);
  if (result.ok) await recordChainRead(ctx.runtime, 'transaction', ref.txHash, result.value);
  return { chain, ref, result };
}
export async function readResearchHistory(
  ctx: ResearchContext,
  actor: Actor | null,
  slug: string,
  input: string,
  query: HistoryQuery,
) {
  const { chain, ref } = researchAddress(ctx, actor, slug, input),
    result = await ctx.chains.getAddressHistory(ref, query);
  if (result.ok)
    await recordChainRead(ctx.runtime, 'address_history', ref.address, result.value, ref.chainId, {
      cursor: query.cursor ?? null,
      limit: query.limit,
      direction: query.direction ?? 'all',
    });
  return { chain, ref, result };
}
export async function readResearchBalances(
  ctx: ResearchContext,
  actor: Actor | null,
  slug: string,
  input: string,
  options: ReadOptions = {},
) {
  const { chain, ref } = researchAddress(ctx, actor, slug, input),
    result = await ctx.chains.getBalances(ref, options);
  if (result.ok) await recordChainRead(ctx.runtime, 'balances', ref.address, result.value, ref.chainId);
  return { chain, ref, result };
}
export async function readResearchToken(
  ctx: ResearchContext,
  actor: Actor | null,
  slug: string,
  input: string,
  options: ReadOptions = {},
) {
  const { chain, ref } = researchAddress(ctx, actor, slug, input),
    result = await ctx.chains.getTokenInfo(ref, options);
  if (result.ok) await recordChainRead(ctx.runtime, 'token_metadata', ref.address, result.value, ref.chainId);
  return { chain, ref, result };
}
export async function readResearchContract(
  ctx: ResearchContext,
  actor: Actor | null,
  slug: string,
  input: string,
  options: ReadOptions = {},
) {
  const { chain, ref } = researchAddress(ctx, actor, slug, input),
    result = await ctx.chains.getContractInfo(ref, options);
  if (result.ok)
    await recordChainRead(ctx.runtime, 'contract_source', ref.address, result.value, ref.chainId);
  return { chain, ref, result };
}
