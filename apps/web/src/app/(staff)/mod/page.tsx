import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/page-header';
import { ReviewDashboard } from '@/components/staff/review-dashboard';
import { StaffOnly } from '@/components/states/access-states';
import { ROLE_LABEL } from '@/lib/staff/permissions';
import { getStaffViewer } from '@/lib/staff/staff-page';

export const metadata: Metadata = { title: 'Review dashboard' };

export default async function ReviewDashboardPage() {
  const staff = await getStaffViewer();
  if (!staff) return <StaffOnly />;
  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="Review dashboard"
        description={`Reports, appeals and correction requests in your scope. Signed in as ${staff.handle} (${ROLE_LABEL[staff.role]}).`}
      />
      <ReviewDashboard staffRole={staff.role} />
    </div>
  );
}
