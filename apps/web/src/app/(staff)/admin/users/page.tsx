import type { Metadata } from 'next';
import { AdminNav } from '@/components/admin/admin-nav';
import { MembersAdmin } from '@/components/admin/members-admin';
import { PageHeader } from '@/components/app/page-header';

export const metadata: Metadata = { title: 'Members' };

export default function MembersAdminPage() {
  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="Members"
        description="Suspend or restore member accounts. Suspended members can read but cannot submit."
      />
      <AdminNav current="/admin/users" />
      <MembersAdmin />
    </div>
  );
}
