import type { Metadata } from 'next';
import { AdminNav } from '@/components/admin/admin-nav';
import { LabelsAdmin } from '@/components/admin/labels-admin';
import { PageHeader } from '@/components/app/page-header';

export const metadata: Metadata = { title: 'Public labels' };

export default function LabelsAdminPage() {
  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="Public labels"
        description="Identification labels shown on address pages. Labels never change the risk band."
      />
      <AdminNav current="/admin/labels" />
      <LabelsAdmin />
    </div>
  );
}
