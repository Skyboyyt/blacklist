import type { Actor } from '../access/index.ts';
import type { DatabaseRuntime } from '@blacklist/db';
import type { ChainId } from '@blacklist/core';
import {
  registry,
  evmAdapter,
  solanaAdapter,
  type ChainDataService,
  type ReadOptions,
  type HistoryQuery,
  type ChainResult,
  type ProviderCapability,
} from '@blacklist/chains';
import { recordChainRead, recordChainConflict } from '../chaindata/index.ts';
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
  await recordResult(ctx, 'account_info', ref.address, ref.chainId, result);
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
  await recordResult(ctx, 'transaction', ref.txHash, ref.chainId, result);
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
  await recordResult(ctx, 'address_history', ref.address, ref.chainId, result, {
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
  await recordResult(ctx, 'balances', ref.address, ref.chainId, result);
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
  await recordResult(ctx, 'token_metadata', ref.address, ref.chainId, result);
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
  await recordResult(ctx, 'contract_source', ref.address, ref.chainId, result);
  return { chain, ref, result };
}

async function recordResult(
  ctx: ResearchContext,
  capability: ProviderCapability,
  subject: string,
  chainId: ChainId,
  result: ChainResult<unknown>,
  cacheScope: unknown = null,
): Promise<void> {
  if (result.ok) await recordChainRead(ctx.runtime, capability, subject, result.value, chainId, cacheScope);
  else if (result.error.kind === 'data_conflict')
    await recordChainConflict(ctx.runtime, capability, subject, chainId, result.error);
}
