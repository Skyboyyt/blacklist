import type { Metadata } from 'next';
import { AdminNav } from '@/components/admin/admin-nav';
import { AdminOverview } from '@/components/admin/admin-overview';
import { PageHeader } from '@/components/app/page-header';

export const metadata: Metadata = { title: 'Administration' };

export default function AdminOverviewPage() {
  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="Administration"
        description="Staff lifecycle, members, labels, suppressions and audit, with two-person rules for privilege increases."
      />
      <AdminNav current="/admin" />
      <AdminOverview />
    </div>
  );
}
