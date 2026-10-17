import type { Metadata } from 'next';
import { isSupportedChain } from '@/components/app/chain-badge';
import { AddressResearchView } from '@/components/research/address-research-view';
import { ChainDetails, type ChainDetailsData } from '@/components/research/chain-details';
import { FinalityToggle } from '@/components/research/finality-toggle';
import { ResearchProblem, UnsupportedNetwork } from '@/components/research/research-unavailable';
import { getResearchApi } from '@/lib/api/server';
import { safeDecodeSegment, truncateMiddle } from '@/lib/format/address';

interface AddressPageProps {
  readonly params: Promise<{ chain: string; address: string }>;
  readonly searchParams: Promise<{ cursor?: string; direction?: string; finality?: string }>;
}

export async function generateMetadata({ params }: AddressPageProps): Promise<Metadata> {
  const { address } = await params;
  return { title: `Address ${truncateMiddle(safeDecodeSegment(address))}` };
}

export default async function AddressPage({ params, searchParams }: AddressPageProps) {
  const { chain, address } = await params;
  if (!isSupportedChain(chain)) return <UnsupportedNetwork network={chain} />;

  const api = await getResearchApi(),
    input = safeDecodeSegment(address),
    query = await searchParams,
    final = query.finality === 'final';
  const result = await api.getAddressResearch(chain, input, final ? { finality: 'final' } : {});
  if (result.kind !== 'found') return <ResearchProblem problem={result} subject="address" />;
  const direction =
    query.direction === 'in'
      ? 'in'
      : query.direction === 'out'
        ? 'out'
        : chain === 'ethereum'
          ? 'out'
          : 'all';
  const [history, token, contract, balances] = await Promise.all([
    api.getAddressHistory?.(chain, input, {
      direction,
      ...(query.cursor && query.cursor.length <= 2048 ? { cursor: query.cursor } : {}),
    }),
    result.data.kind === 'token' || (chain === 'ethereum' && result.data.kind === 'contract')
      ? api.getTokenResearch?.(chain, input)
      : undefined,
    chain === 'ethereum' && result.data.kind === 'contract'
      ? api.getContractResearch?.(chain, input)
      : undefined,
    result.data.kind !== 'token' ? api.getTokenBalances?.(chain, input) : undefined,
  ]);
  const details: ChainDetailsData = {
    direction,
    ...(history ? { history } : {}),
    ...(token ? { token } : {}),
    ...(contract ? { contract } : {}),
    ...(balances ? { balances } : {}),
  };
  return (
    <div className="flex flex-col gap-6">
      <FinalityToggle href={`/address/${chain}/${encodeURIComponent(input)}`} final={final} />
      <AddressResearchView data={result.data} />
      <ChainDetails chain={chain} address={input} data={details} />
    </div>
  );
}
