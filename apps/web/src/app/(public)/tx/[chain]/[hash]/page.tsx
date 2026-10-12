import type { Metadata } from 'next';
import { isSupportedChain } from '@/components/app/chain-badge';
import { ResearchProblem, UnsupportedNetwork } from '@/components/research/research-unavailable';
import { TransactionResearchView } from '@/components/research/transaction-research-view';
import { getResearchApi } from '@/lib/api/server';
import { safeDecodeSegment, truncateMiddle } from '@/lib/format/address';

interface TxPageProps {
  readonly params: Promise<{ chain: string; hash: string }>;
}

export async function generateMetadata({ params }: TxPageProps): Promise<Metadata> {
  const { hash } = await params;
  return { title: `Transaction ${truncateMiddle(safeDecodeSegment(hash))}` };
}

export default async function TransactionPage({ params }: TxPageProps) {
  const { chain, hash } = await params;
  if (!isSupportedChain(chain)) return <UnsupportedNetwork network={chain} />;

  const result = await (await getResearchApi()).getTransactionResearch(chain, safeDecodeSegment(hash));
  if (result.kind !== 'found') return <ResearchProblem problem={result} subject="transaction" />;
  return <TransactionResearchView data={result.data} />;
}
