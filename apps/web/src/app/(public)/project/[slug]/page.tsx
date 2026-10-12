import { projectSlugSchema } from '@blacklist/contracts';
import type { Metadata } from 'next';
import { ProjectDetailView } from '@/components/projects/project-detail-view';
import { ResearchProblem } from '@/components/research/research-unavailable';
import { getResearchApi } from '@/lib/api/server';
import { safeDecodeSegment } from '@/lib/format/address';

interface ProjectPageProps {
  readonly params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const parsed = projectSlugSchema.safeParse(safeDecodeSegment(slug));
  return { title: parsed.success ? `Project ${parsed.data}` : 'Project' };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const parsed = projectSlugSchema.safeParse(safeDecodeSegment(slug));
  if (!parsed.success) {
    return (
      <ResearchProblem
        problem={{ kind: 'invalid_identifier', reason: 'This is not a valid project profile link.' }}
        subject="project"
      />
    );
  }
  const api = await getResearchApi();
  const [result, viewer] = await Promise.all([api.getProject(parsed.data), api.getViewer()]);
  if (result.kind !== 'found') return <ResearchProblem problem={result} subject="project" />;
  return <ProjectDetailView project={result.data} viewer={viewer} />;
}
