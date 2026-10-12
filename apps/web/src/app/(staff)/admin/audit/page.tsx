import type { Metadata } from 'next';
import { AdminNav } from '@/components/admin/admin-nav';
import { PageHeader } from '@/components/app/page-header';
import { AuditLogView } from '@/components/staff/audit-log-view';

export const metadata: Metadata = { title: 'Audit history' };

export default function AuditPage() {
  return (
    <div className="flex flex-col gap-2">
      <PageHeader title="Audit history" description="Who did what, when and why, across staff review." />
      <AdminNav current="/admin/audit" />
      <AuditLogView />
    </div>
  );
}
