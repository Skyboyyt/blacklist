import type { Metadata } from 'next';
import { AdminNav } from '@/components/admin/admin-nav';
import { StaffAdmin } from '@/components/admin/staff-admin';
import { PageHeader } from '@/components/app/page-header';

export const metadata: Metadata = { title: 'Staff' };

export default function StaffAdminPage() {
  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="Staff"
        description="Invitations, role changes, suspension, offboarding and recovery."
      />
      <AdminNav current="/admin/staff" />
      <StaffAdmin />
    </div>
  );
}
