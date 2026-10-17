import { searchResponseSchema, type ChainSlugDto } from '@blacklist/contracts';
import {
  classifyResearchInput,
  detectResearchChains,
  type ResearchContext,
  type Actor,
} from '@blacklist/domain';
import { addressResearch, transactionResearch } from './research.ts';
export async function searchResearch(
  ctx: ResearchContext,
  actor: Actor | null,
  chain: ChainSlugDto,
  input: string,
) {
  const { classification, adapter } = classifyResearchInput(chain, input);
  if (classification.kind === 'unrecognized')
    return { kind: 'invalid_identifier', reason: 'This identifier is not valid on the chosen network.' };
  const id = classification.kind === 'address' ? classification.address : classification.txHash;
  const result =
    classification.kind === 'address'
      ? await addressResearch(ctx, actor, chain, id)
      : await transactionResearch(ctx, actor, chain, id);
  if (result.kind !== 'found')
    return searchResponseSchema.parse(
      result.kind === 'not_found' ? result : { kind: 'provider_unavailable', retryAfterSeconds: 30 },
    );
  return searchResponseSchema.parse({
    kind: 'results',
    hits: [
      {
        kind: classification.kind,
        chain,
        id,
        displayId: classification.kind === 'address' ? adapter.formatAddress(classification.address) : id,
        band: null,
        summary: 'Blockchain data only; no risk assessment has been made.',
      },
    ],
  });
}

/**
 * A search without a chosen network: the API classifies the input on every supported
 * network. One match is searched; a value valid on both asks the user to choose (never
 * guessed); no match is an invalid identifier.
 */
export async function detectAndSearch(ctx: ResearchContext, actor: Actor | null, input: string) {
  const chains = detectResearchChains(input);
  const [only] = chains;
  if (!only)
    return {
      kind: 'invalid_identifier',
      reason: 'Enter a wallet address, contract address or transaction hash.',
    };
  if (chains.length === 1) return searchResearch(ctx, actor, only, input);
  return searchResponseSchema.parse({
    kind: 'choose_network',
    candidates: chains.map((chain) => {
      const { classification, adapter } = classifyResearchInput(chain, input);
      return {
        chain,
        interpretedAs:
          classification.kind === 'address' ? adapter.formatAddress(classification.address) : input.trim(),
        note: 'The same text on two networks identifies two different accounts.',
      };
    }),
  });
}
