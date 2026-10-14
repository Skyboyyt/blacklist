import { searchResponseSchema, type ChainSlugDto } from '@blacklist/contracts';
import { classifyResearchInput, type ResearchContext, type Actor } from '@blacklist/domain';
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
