import type { SearchHit, SearchResponse } from '@blacklist/contracts';
import Link from 'next/link';
import { ChainBadge, CHAIN_NAMES } from '@/components/app/chain-badge';
import { EmptyState } from '@/components/app/empty-state';
import { Notice } from '@/components/app/notice';
import { RiskBadge } from '@/components/app/risk-badge';
import { ButtonLink } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { truncateMiddle } from '@/lib/format/address';
import { searchHref } from '@/lib/search/search-input-state';

function hitHref(hit: SearchHit): string {
  const base = hit.kind === 'address' ? '/address' : '/tx';
  return `${base}/${hit.chain}/${encodeURIComponent(hit.id)}`;
}

/** Renders every search response state. Remote errors are thrown to the route error boundary. */
export function SearchResults({
  query,
  response,
}: {
  readonly query: string;
  readonly response: SearchResponse;
}) {
  switch (response.kind) {
    case 'results':
      return (
        <section aria-labelledby="results-heading">
          <h2 id="results-heading" className="mb-3 text-sm font-medium text-muted">
            {response.hits.length === 1 ? '1 result' : `${response.hits.length} results`}
          </h2>
          <ul className="flex flex-col gap-3">
            {response.hits.map((hit) => (
              <li key={`${hit.chain}:${hit.id}`}>
                <Link
                  href={hitHref(hit)}
                  className="group flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-sm hover:border-border-strong sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <ChainBadge chain={hit.chain} />
                      <span className="text-xs font-medium text-muted">
                        {hit.kind === 'address' ? 'Address' : 'Transaction'}
                      </span>
                    </div>
                    <p className="identifier truncate text-sm text-text" title={hit.displayId}>
                      {truncateMiddle(hit.displayId, 10, 8)}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{hit.summary}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {hit.band ? <RiskBadge band={hit.band} /> : null}
                    <Icon name="chevronRight" className="size-4 text-subtle group-hover:text-text" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      );

    case 'choose_network':
      return (
        <section
          aria-labelledby="choose-heading"
          className="rounded-lg border border-info/30 bg-info-soft p-4"
        >
          <h2 id="choose-heading" className="font-semibold text-text">
            Address detected — choose network
          </h2>
          <p className="mt-1 text-sm text-muted">
            This value is valid on more than one network. The same string on two networks identifies two
            different accounts.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {response.candidates.map((c) => (
              <li key={c.chain}>
                <Link
                  href={searchHref(query, c.chain)}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface p-3 hover:border-border-strong"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-medium text-text">
                      Search on {CHAIN_NAMES[c.chain]} <ChainBadge chain={c.chain} />
                    </span>
                    <span className="identifier block truncate text-xs text-muted">{c.interpretedAs}</span>
                    <span className="block text-xs text-muted">{c.note}</span>
                  </span>
                  <Icon name="chevronRight" className="size-4 text-subtle" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      );

    case 'not_found':
      return (
        <EmptyState
          icon="search"
          title="No records found"
          description={
            <>
              Blacklist has no records or activity for this identifier on the supported networks.{' '}
              <strong className="text-text">This is not a sign that it is safe.</strong>
            </>
          }
        />
      );

    case 'invalid_identifier':
      return (
        <Notice tone="danger" title="That doesn’t look like a supported address or transaction hash">
          {response.reason}
        </Notice>
      );

    case 'unsupported_network':
      return (
        <Notice tone="warning" title="Network not supported">
          {response.network} is not supported yet. Blacklist currently supports Ethereum and Solana.
        </Notice>
      );

    case 'provider_unavailable':
      return (
        <div className="flex flex-col gap-3">
          <Notice tone="warning" title="Blockchain data is temporarily unavailable">
            Our blockchain data providers are not responding. Try again in about {response.retryAfterSeconds}{' '}
            seconds. No assessment was made.
          </Notice>
          <div>
            <ButtonLink href={searchHref(query)} variant="secondary" size="sm" prefetch={false}>
              Try again
            </ButtonLink>
          </div>
        </div>
      );
  }
}
