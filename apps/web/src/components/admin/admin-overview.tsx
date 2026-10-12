'use client';

import type { AdminOverview as Overview } from '@blacklist/contracts';
import Link from 'next/link';
import { DataCard } from '@/components/app/data-card';
import { Notice } from '@/components/app/notice';
import { LoadingStatus } from '@/components/states/skeletons';
import { AccessDenied, StaffLoadError } from '@/components/staff/staff-states';
import type { AdminApi } from '@/lib/api/types';
import { formatDateTimeUtc } from '@/lib/format/date';
import { useAdminData } from './use-admin-data';

const read = (api: AdminApi) => api.getOverview();

const TILES: readonly { key: Exclude<keyof Overview, 'alerts'>; label: string; href: string }[] = [
  { key: 'activeStaff', label: 'Active staff', href: '/admin/staff' },
  { key: 'pendingInvitations', label: 'Invitations awaiting a second admin', href: '/admin/staff' },
  { key: 'pendingRoleRequests', label: 'Role changes awaiting approval', href: '/admin/staff' },
  { key: 'openRecoveryCases', label: 'Open staff recoveries', href: '/admin/staff' },
  { key: 'suspendedMembers', label: 'Suspended members', href: '/admin/users' },
  { key: 'activeLabels', label: 'Active public labels', href: '/admin/labels' },
  { key: 'activeSuppressions', label: 'Active suppressions', href: '/admin/signals' },
];

/** Administrator overview: what waits on an admin, and alerts every admin must see. */
export function AdminOverview() {
  const { load, reload } = useAdminData(read);
  if (load.kind === 'loading') return <LoadingStatus label="Loading the overview…" />;
  if (load.kind === 'error') return <StaffLoadError onRetry={() => void reload()} />;
  if (load.kind === 'forbidden') return <AccessDenied detail={load.detail} />;
  const o = load.data;
  return (
    <div className="flex flex-col gap-6">
      {o.alerts.length > 0 ? (
        <Notice tone="warning" title="Alerts for all administrators">
          <ul className="flex flex-col gap-1">
            {o.alerts.map((a) => (
              <li key={a.id}>
                <time dateTime={a.at} className="text-xs text-muted">
                  {formatDateTimeUtc(a.at)}
                </time>{' '}
                {a.text}
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TILES.map((t) => (
          <div key={t.key} className="rounded-lg border border-border bg-surface p-3">
            <dt className="text-xs font-medium text-muted">
              <Link href={t.href} className="hover:underline">
                {t.label}
              </Link>
            </dt>
            <dd className="mt-1 text-2xl font-semibold text-text tabular-nums">{o[t.key]}</dd>
          </div>
        ))}
      </dl>
      <DataCard title="Two-person rules">
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted">
          <li>
            Inviting an administrator, granting a role and removing another administrator need a second
            administrator.
          </li>
          <li>
            Removing a moderator or appeal-reviewer role, suspending and offboarding take effect at once.
          </li>
          <li>
            Staff recovery needs two identity verifications, approval by a different administrator and a
            24-hour objection window.
          </li>
          <li>Every consequential action asks for your security key and is recorded in the audit history.</li>
        </ul>
      </DataCard>
    </div>
  );
}
