import type { Metadata } from 'next';
import Link from 'next/link';
import { DataCard } from '@/components/app/data-card';
import { EmptyState } from '@/components/app/empty-state';
import { PageHeader } from '@/components/app/page-header';
import { ReportStatusBadge } from '@/components/app/report-status-badge';
import { SearchBar } from '@/components/search/search-bar';
import { getResearchApi } from '@/lib/api/server';
import { truncateMiddle } from '@/lib/format/address';
import { formatDateTimeUtc, formatDateUtc } from '@/lib/format/date';
import { searchHref } from '@/lib/search/search-input-state';

export const metadata: Metadata = { title: 'Dashboard' };

/** The viewer's own activity only. No platform-wide statistics are shown or implied. */
export default async function DashboardPage() {
  const dashboard = await (await getResearchApi()).getDashboard();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" description="Your recent research, reports and notices." />

      <DataCard title="Research">
        <SearchBar />
      </DataCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <DataCard title="Recent searches">
          {dashboard.recentSearches.length === 0 ? (
            <EmptyState icon="search" title="No recent searches" />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {dashboard.recentSearches.map((s) => (
                <li key={`${s.query}-${s.at}`} className="flex items-center justify-between gap-3 py-2">
                  <Link
                    href={searchHref(s.query)}
                    className="identifier truncate text-sm text-accent hover:underline"
                    title={s.query}
                  >
                    {truncateMiddle(s.query, 10, 8)}
                  </Link>
                  <time dateTime={s.at} className="shrink-0 text-xs text-muted">
                    {formatDateUtc(s.at)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </DataCard>

        <DataCard
          title="My reports"
          actions={
            <Link href="/reports" className="text-sm font-medium text-accent hover:underline">
              View all
            </Link>
          }
        >
          {dashboard.myReports.length === 0 ? (
            <EmptyState icon="reports" title="No reports yet" />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {dashboard.myReports.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate text-sm text-text">{r.title}</span>
                  <ReportStatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </DataCard>
      </div>

      <DataCard title="Notices">
        {dashboard.notices.length === 0 ? (
          <p className="text-sm text-muted">No notices.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {dashboard.notices.map((n) => (
              <li key={n.id} className="text-sm">
                <p className="text-text">{n.text}</p>
                <time dateTime={n.at} className="text-xs text-muted">
                  {formatDateTimeUtc(n.at)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </DataCard>
    </div>
  );
}
