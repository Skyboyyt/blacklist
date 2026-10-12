import type { Metadata } from 'next';
import { isSupportedChain } from '@/components/app/chain-badge';
import { AddressResearchView } from '@/components/research/address-research-view';
import { ResearchProblem, UnsupportedNetwork } from '@/components/research/research-unavailable';
import { getResearchApi } from '@/lib/api/server';
import { safeDecodeSegment, truncateMiddle } from '@/lib/format/address';

interface AddressPageProps {
  readonly params: Promise<{ chain: string; address: string }>;
}

export async function generateMetadata({ params }: AddressPageProps): Promise<Metadata> {
  const { address } = await params;
  return { title: `Address ${truncateMiddle(safeDecodeSegment(address))}` };
}

export default async function AddressPage({ params }: AddressPageProps) {
  const { chain, address } = await params;
  if (!isSupportedChain(chain)) return <UnsupportedNetwork network={chain} />;

  const result = await (await getResearchApi()).getAddressResearch(chain, safeDecodeSegment(address));
  if (result.kind !== 'found') return <ResearchProblem problem={result} subject="address" />;
  return <AddressResearchView data={result.data} />;
}
