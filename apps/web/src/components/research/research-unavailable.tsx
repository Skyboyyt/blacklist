import { EmptyState } from '@/components/app/empty-state';
import { Notice } from '@/components/app/notice';
import { ButtonLink } from '@/components/ui/button';
import type { ResearchResult } from '@/lib/api/types';

type Problem = Exclude<ResearchResult<unknown>, { kind: 'found' }>;

/** Shared non-success states for research pages. */
export function ResearchProblem({
  problem,
  subject,
}: {
  readonly problem: Problem;
  readonly subject: string;
}) {
  switch (problem.kind) {
    case 'not_found':
      return (
        <EmptyState
          icon="search"
          titleAs="h1"
          title={`No records for this ${subject}`}
          description={
            <>
              Blacklist has no records or activity for this {subject}.{' '}
              <strong className="text-text">This is not a sign that it is safe.</strong>
            </>
          }
          action={
            <ButtonLink href="/search" variant="secondary">
              New search
            </ButtonLink>
          }
        />
      );
    case 'invalid_identifier':
      return (
        <>
          <h1 className="mb-4 text-2xl font-semibold text-text">Invalid identifier</h1>
          <Notice tone="danger">{problem.reason}</Notice>
        </>
      );
    case 'provider_unavailable':
      return (
        <>
          <h1 className="mb-4 text-2xl font-semibold text-text">
            Blockchain data is temporarily unavailable
          </h1>
          <Notice tone="warning">
            Our blockchain data providers are not responding. Try again in about {problem.retryAfterSeconds}{' '}
            seconds. No assessment was made.
          </Notice>
        </>
      );
  }
}

export function UnsupportedNetwork({ network }: { readonly network: string }) {
  return (
    <EmptyState
      icon="info"
      titleAs="h1"
      title="Network not supported"
      description={`“${network.slice(0, 40)}” is not a supported network. Blacklist currently supports Ethereum and Solana.`}
      action={
        <ButtonLink href="/search" variant="secondary">
          New search
        </ButtonLink>
      }
    />
  );
}
