import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/app/page-header';
import { ProjectDirectoryResults } from '@/components/projects/project-directory-results';
import { ButtonLink } from '@/components/ui/button';
import { ProjectFilters } from '@/components/projects/project-filters';
import { UnsupportedNetwork } from '@/components/research/research-unavailable';
import { ResultsSkeleton } from '@/components/states/skeletons';
import { getResearchApi } from '@/lib/api/server';
import { NAME_WARNING, PROFILE_DISCLAIMER } from '@/lib/projects/copy';
import { parseDirectoryParams } from '@/lib/projects/directory-params';
import type { ProjectDirectoryQuery } from '@blacklist/contracts';

export const metadata: Metadata = { title: 'Projects' };

interface ProjectsPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function Results({ query }: { readonly query: ProjectDirectoryQuery }) {
  const response = await (await getResearchApi()).listProjects(query);
  return <ProjectDirectoryResults query={query} response={response} />;
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const parsed = parseDirectoryParams(await searchParams);
  const query = parsed.query;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Projects"
        description="Project profiles created and reviewed by Blacklist staff, with their official addresses, findings and history."
        actions={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/scoreboard" variant="ghost" size="sm">
              Risk ranking
            </ButtonLink>
            <ButtonLink href="/projects/suggest" variant="secondary" size="sm">
              Suggest a project
            </ButtonLink>
          </div>
        }
      />
      <p className="text-sm text-muted">
        {PROFILE_DISCLAIMER} {NAME_WARNING}
      </p>
      <ProjectFilters query={query} />
      {parsed.kind === 'unsupported_network' ? (
        <UnsupportedNetwork network={parsed.network} />
      ) : (
        <Suspense key={JSON.stringify(query)} fallback={<ResultsSkeleton />}>
          <Results query={query} />
        </Suspense>
      )}
    </div>
  );
}
