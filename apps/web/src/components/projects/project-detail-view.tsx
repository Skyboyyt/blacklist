import type { ProjectDetail, Viewer } from '@blacklist/contracts';
import { ChainBadge } from '@/components/app/chain-badge';
import { DataCard } from '@/components/app/data-card';
import { Notice } from '@/components/app/notice';
import { PageHeader } from '@/components/app/page-header';
import { StatusTimeline } from '@/components/app/status-timeline';
import { FindingsList } from '@/components/research/findings-list';
import { Badge } from '@/components/ui/badge';
import { formatDateTimeUtc, formatDateUtc } from '@/lib/format/date';
import {
  ATTRIBUTION_DISCLAIMER,
  BASIS_COPY,
  CATEGORY_LABEL,
  FRESHNESS_COPY,
  NAME_WARNING,
  NO_COMBINED_RATING,
  PROFILE_DISCLAIMER,
  STANDING_LABEL,
} from '@/lib/projects/copy';
import { OfficialAddressList } from './official-address-list';
import { ProjectActions } from './project-actions';

/**
 * Project profile: identity → limits of the profile → official addresses (each with
 * its own assessment and separate disclosures) → domains → findings and responses →
 * history. There is no combined project rating and no numeric score (P-11).
 */
export function ProjectDetailView({
  project,
  viewer,
}: {
  readonly project: ProjectDetail;
  readonly viewer: Viewer;
}) {
  const networks = [...new Set(project.officialAddresses.map((a) => a.chain))];
  const freshness = FRESHNESS_COPY[project.freshness.state];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            Project · {CATEGORY_LABEL[project.category]}
            {networks.map((n) => (
              <ChainBadge key={n} chain={n} />
            ))}
          </span>
        }
        title={project.name}
        description={project.description}
        actions={<ProjectActions viewer={viewer} slug={project.slug} />}
      />

      <Notice tone="info" title="What this profile means">
        {PROFILE_DISCLAIMER} {NO_COMBINED_RATING}
      </Notice>

      <dl className="grid gap-4 rounded-lg border border-border bg-surface p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs font-medium text-muted">Profile identifier</dt>
          <dd className="identifier mt-1 text-text">{project.slug}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted">Last reviewed by staff</dt>
          <dd className="mt-1 text-text">
            <time dateTime={project.lastReviewedAt}>{formatDateUtc(project.lastReviewedAt)}</time>
            <span className="block text-xs text-muted">Revision {project.profileRevision}</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted">Last updated</dt>
          <dd className="mt-1 text-text">
            <time dateTime={project.updatedAt}>{formatDateTimeUtc(project.updatedAt)}</time>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted">Data status</dt>
          <dd className="mt-1">
            <Badge tone={freshness.tone}>{freshness.label}</Badge>
          </dd>
        </div>
      </dl>

      {project.freshness.state !== 'current' && project.freshness.note ? (
        <Notice tone={project.freshness.state === 'stale' ? 'warning' : 'info'} title={freshness.label}>
          {project.freshness.note}
        </Notice>
      ) : null}

      <DataCard
        id="official-addresses"
        title="Official addresses"
        description={
          <>
            {ATTRIBUTION_DISCLAIMER} {NAME_WARNING}
          </>
        }
      >
        <OfficialAddressList addresses={project.officialAddresses} />
      </DataCard>

      <DataCard
        id="official-domains"
        title="Official domains"
        description="Shown as text. Type addresses yourself rather than following links from messages."
      >
        {project.domains.length === 0 ? (
          <p className="text-sm text-muted">No official domains listed.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {project.domains.map((d) => (
              <li key={d.hostname} className="flex flex-col gap-1 rounded-md border border-border p-3">
                <span className="identifier text-text">{d.hostname}</span>
                <span className="text-xs text-muted">
                  {BASIS_COPY[d.basis].label}. {d.basisNote} Listed{' '}
                  <time dateTime={d.attributedAt}>{formatDateUtc(d.attributedAt)}</time>.
                </span>
              </li>
            ))}
          </ul>
        )}
      </DataCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <DataCard id="findings" title={`Published findings (${project.findings.length})`}>
          <FindingsList findings={project.findings} />
        </DataCard>
        <DataCard id="responses" title={`Responses from the project (${project.responses.length})`}>
          {project.responses.length === 0 ? (
            <p className="text-sm text-muted">No published responses.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {project.responses.map((r) => (
                <li key={r.id} className="flex flex-col gap-1.5 rounded-md border border-border p-3">
                  <p className="text-sm text-text">{r.summary}</p>
                  <p className="text-xs text-muted">
                    Standing: {STANDING_LABEL[r.standing]} · Published{' '}
                    <time dateTime={r.publishedAt}>{formatDateUtc(r.publishedAt)}</time>
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">
            Responses are the project’s own statements. Standing shows how the right to respond was
            established, not that the statement is true.
          </p>
        </DataCard>
      </div>

      <DataCard id="history" title="Profile history">
        <StatusTimeline events={project.history} />
      </DataCard>
    </div>
  );
}
