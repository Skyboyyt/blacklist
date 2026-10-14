import type { ResearchProvenance } from '@blacklist/domain';
import type { ChainSlugDto } from '@blacklist/contracts';
/** Stable public provider attribution, never raw IDs, URLs, keys or receipt parameters. */
export function publicResearchSource(chain: ChainSlugDto, provenance: ResearchProvenance) {
  const known =
    provenance.providerId === 'alchemy-ethereum'
      ? 'Alchemy Ethereum RPC'
      : provenance.providerId === 'helius-solana'
        ? 'Helius Solana RPC'
        : `${chain === 'ethereum' ? 'Ethereum' : 'Solana'} RPC`;
  return `${known} (${provenance.finality === 'final' ? 'finalized' : 'pending'}; ${provenance.verification.replaceAll('_', ' ')})`;
}
export function publicResearchProvenance(chain: ChainSlugDto, value: ResearchProvenance) {
  return {
    chain,
    source: publicResearchSource(chain, value),
    fetchedAt: value.fetchedAt.toISOString(),
    snapshot: value.snapshot,
    finality: value.finality,
    verification: value.verification,
    degraded: value.degraded,
  };
}
