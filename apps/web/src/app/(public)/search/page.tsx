import { CHAIN_SLUGS, searchRequestSchema } from '@blacklist/contracts';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/app/page-header';
import { SearchBar } from '@/components/search/search-bar';
import { SearchResults } from '@/components/search/search-results';
import { ResultsSkeleton } from '@/components/states/skeletons';
import { getResearchApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Research' };

interface SearchPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

async function Results({ query, chain }: { readonly query: string; readonly chain: string | undefined }) {
  // An explicitly requested network is never dropped or replaced: unknown ones are reported.
  if (chain !== undefined && !(CHAIN_SLUGS as readonly string[]).includes(chain)) {
    return (
      <SearchResults query={query} response={{ kind: 'unsupported_network', network: chain.slice(0, 40) }} />
    );
  }
  const parsed = searchRequestSchema.safeParse({ query, chain });
  const api = await getResearchApi();
  const response = parsed.success
    ? await api.search(parsed.data)
    : {
        kind: 'invalid_identifier' as const,
        reason: 'Enter a wallet address, contract address or transaction hash.',
      };
  return <SearchResults query={query} response={response} />;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = single(params['q'])?.trim() ?? '';
  const chain = single(params['chain']);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Research"
        description="Search an Ethereum or Solana address, contract or transaction."
      />
      <SearchBar key={query} initialValue={query} />
      {query ? (
        <Suspense key={`${query}|${chain ?? ''}`} fallback={<ResultsSkeleton />}>
          <Results query={query} chain={chain} />
        </Suspense>
      ) : null}
    </div>
  );
}
