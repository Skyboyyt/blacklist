import type { Metadata } from 'next';
import Link from 'next/link';
import { DataCard } from '@/components/app/data-card';
import { EmptyState } from '@/components/app/empty-state';
import { PageHeader } from '@/components/app/page-header';
import { ReportStatusBadge } from '@/components/app/report-status-badge';
import { ButtonLink } from '@/components/ui/button';
import { getResearchApi } from '@/lib/api/server';
import { optionalFeature } from '@/lib/api/availability';
import { MySubmissions } from '@/components/submissions/my-submissions';
import { formatDateUtc } from '@/lib/format/date';

export const metadata: Metadata = { title: 'Reports' };

export default async function ReportsPage() {
  const api = await getResearchApi(),
    dashboard = await optionalFeature(() => api.getDashboard());
  const header = (
    <PageHeader
      title="My reports"
      description="Your own reports. Only you and Blacklist staff can see them; nothing is public unless a moderator publishes a finding."
      actions={<ButtonLink href="/reports/new">New report</ButtonLink>}
    />
  );
  // The live API lists submissions through the member API (the research dashboard is Phase 10).
  if (!dashboard)
    return (
      <div className="flex flex-col gap-6">
        {header}
        <DataCard>
          <MySubmissions />
        </DataCard>
      </div>
    );
  const { myReports } = dashboard;
  return (
    <div className="flex flex-col gap-6">
      {header}
      <DataCard>
        {myReports.length === 0 ? (
          <EmptyState
            icon="reports"
            title="No reports yet"
            description="When you report a scam, it appears here with its review status."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {myReports.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <Link
                  href={`/reports/${r.id}`}
                  className="text-sm font-medium break-words text-text hover:underline"
                >
                  {r.title}
                </Link>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-muted">
                    {r.submittedAt ? `Submitted ${formatDateUtc(r.submittedAt)} · ` : 'Draft · '}Updated{' '}
                    {formatDateUtc(r.updatedAt)}
                  </span>
                  <ReportStatusBadge status={r.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </DataCard>
    </div>
  );
}
