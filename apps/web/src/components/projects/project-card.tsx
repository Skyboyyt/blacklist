import type { ProjectSummary } from '@blacklist/contracts';
import Link from 'next/link';
import { ChainBadge, CHAIN_NAMES } from '@/components/app/chain-badge';
import { Badge } from '@/components/ui/badge';
import { truncateMiddle } from '@/lib/format/address';
import { formatDateUtc } from '@/lib/format/date';
import { CATEGORY_LABEL, FRESHNESS_COPY, findingsCountLabel } from '@/lib/projects/copy';
import { DISPUTE_COPY } from '@/lib/risk/copy';

/**
 * Directory card: name, networks, a full official identifier, published findings and
 * review date. No band or score: projects have no combined rating in V1 (P-11, Post-V1
 * aggregate assessments). The identifier, not the name, is what identifies the project.
 */
export function ProjectCard({ project }: { readonly project: ProjectSummary }) {
  const dispute = DISPUTE_COPY[project.disputeState];
  const id = project.primaryIdentifier;
  return (
    <article
      aria-labelledby={`project-${project.slug}`}
      className="flex h-full flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>{CATEGORY_LABEL[project.category]}</span>
        {project.networks.map((n) => (
          <ChainBadge key={n} chain={n} />
        ))}
      </div>
      <h3 id={`project-${project.slug}`} className="text-base font-semibold text-text">
        <Link href={`/project/${project.slug}`} className="hover:underline">
          {project.name}
        </Link>
      </h3>
      {id ? (
        <p className="text-sm text-muted">
          <span className="sr-only">Official address on {CHAIN_NAMES[id.chain]}: </span>
          <span className="identifier text-text" title={id.displayAddress}>
            {truncateMiddle(id.displayAddress, 10, 8)}
          </span>
          {project.officialAddressCount > 1 ? (
            <span> and {project.officialAddressCount - 1} more official</span>
          ) : null}
        </p>
      ) : (
        <p className="text-sm text-muted">No official addresses listed yet.</p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-2">
        <Badge tone={project.publishedFindingCount > 0 ? 'warning' : 'neutral'}>
          {findingsCountLabel(project.publishedFindingCount)}
        </Badge>
        {dispute ? (
          <Badge tone={project.disputeState === 'under_appeal' ? 'info' : 'warning'}>{dispute}</Badge>
        ) : null}
        {project.freshness !== 'current' ? (
          <Badge tone={FRESHNESS_COPY[project.freshness].tone}>
            {FRESHNESS_COPY[project.freshness].label}
          </Badge>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        Profile reviewed{' '}
        <time dateTime={project.lastReviewedAt}>{formatDateUtc(project.lastReviewedAt)}</time>
      </p>
    </article>
  );
}
