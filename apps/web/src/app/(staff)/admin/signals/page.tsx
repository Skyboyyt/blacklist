import type { Metadata } from 'next';
import { AdminNav } from '@/components/admin/admin-nav';
import { SuppressionsAdmin } from '@/components/admin/suppressions-admin';
import { PageHeader } from '@/components/app/page-header';

export const metadata: Metadata = { title: 'Suppressions' };

export default function SuppressionsAdminPage() {
  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="Suppressions"
        description="Audited suppressions of automated indicators, shown publicly with their reason."
      />
      <AdminNav current="/admin/signals" />
      <SuppressionsAdmin />
    </div>
  );
}
