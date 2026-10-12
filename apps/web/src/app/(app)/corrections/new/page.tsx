import { projectSlugSchema } from '@blacklist/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Notice } from '@/components/app/notice';
import { PageHeader } from '@/components/app/page-header';
import { CorrectionForm } from '@/components/submissions/correction-form';
import { getResearchApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Propose a correction' };

interface PageProps {
  readonly searchParams: Promise<{ project?: string | string[] }>;
}

export default async function NewCorrectionPage({ searchParams }: PageProps) {
  const { project } = await searchParams;
  const parsed = projectSlugSchema.safeParse(typeof project === 'string' ? project : '');
  const result = parsed.success ? await (await getResearchApi()).getProject(parsed.data) : null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Propose a correction"
        description="Point out an error in a project profile. No standing is needed. Staff review the change before the public profile is revised, and the revision history stays visible."
      />
      {result?.kind === 'found' ? (
        <CorrectionForm
          target={{
            slug: result.data.slug,
            name: result.data.name,
            description: result.data.description,
            domains: result.data.domains.map((d) => d.hostname),
          }}
        />
      ) : (
        <Notice tone="info" title="Choose a project first">
          Open the project in the{' '}
          <Link href="/projects" className="font-medium text-accent hover:underline">
            project directory
          </Link>{' '}
          and select “Propose a correction”.
        </Notice>
      )}
    </div>
  );
}
