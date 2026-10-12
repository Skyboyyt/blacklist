import type { ProjectDirectoryQuery, ProjectDirectoryResponse } from '@blacklist/contracts';
import { EmptyState } from '@/components/app/empty-state';
import { Notice } from '@/components/app/notice';
import { ButtonLink } from '@/components/ui/button';
import { directoryHref } from '@/lib/projects/directory-params';
import { Pagination } from './pagination';
import { ProjectCard } from './project-card';

/** Every directory response state. Unexpected failures go to the route error boundary. */
export function ProjectDirectoryResults({
  query,
  response,
}: {
  readonly query: ProjectDirectoryQuery;
  readonly response: ProjectDirectoryResponse;
}) {
  switch (response.kind) {
    case 'results': {
      const first = (response.page - 1) * response.pageSize + 1;
      const last = first + response.items.length - 1;
      return (
        <section aria-labelledby="project-results-heading" className="flex flex-col gap-4">
          <h2 id="project-results-heading" className="text-sm font-medium text-muted">
            Showing {first}–{last} of {response.totalItems}{' '}
            {response.totalItems === 1 ? 'project' : 'projects'}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {response.items.map((p) => (
              <li key={p.slug}>
                <ProjectCard project={p} />
              </li>
            ))}
          </ul>
          <Pagination
            page={response.page}
            totalPages={response.totalPages}
            hrefFor={(page) => directoryHref(query, { page })}
          />
        </section>
      );
    }
    case 'no_results':
      return (
        <EmptyState
          icon="search"
          titleAs="h2"
          title="No projects match"
          description={
            <>
              No project profile matches this search and these filters.{' '}
              <strong className="text-text">This does not mean a project is safe or unsafe.</strong>
            </>
          }
          action={
            <ButtonLink href="/projects" variant="secondary">
              Clear filters
            </ButtonLink>
          }
        />
      );
    case 'empty_directory':
      return (
        <EmptyState
          titleAs="h2"
          title="No project profiles yet"
          description="Blacklist staff have not published any project profiles yet."
        />
      );
    case 'choose_network':
      return (
        <Notice tone="info" title="Choose a network for this address">
          Addresses are searched on one network at a time and are never matched across networks. Pick Ethereum
          or Solana under Network, then search again.
        </Notice>
      );
    case 'invalid_query':
      return (
        <Notice tone="danger" title="That search can’t be used here">
          {response.reason}
        </Notice>
      );
    case 'provider_unavailable':
      return (
        <Notice tone="warning" title="Project data is temporarily unavailable">
          Try again in about {response.retryAfterSeconds} seconds.
        </Notice>
      );
  }
}
