import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/page-header';
import { ApprovalsView } from '@/components/staff/approvals-view';

export const metadata: Metadata = { title: 'Approvals' };

export default function ApprovalsPage() {
  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="Finding approvals"
        description="Approve or reject exact finding revisions. Publication is a system effect of an approval."
      />
      <ApprovalsView />
    </div>
  );
}
