import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/page-header';
import { ReviewDashboard } from '@/components/staff/review-dashboard';
import { StaffOnly } from '@/components/states/access-states';
import { getStaffViewer } from '@/lib/staff/staff-page';

export const metadata: Metadata = { title: 'Appeal reviews' };

export default async function AppealReviewsPage() {
  const staff = await getStaffViewer();
  if (!staff) return <StaffOnly />;
  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="Appeal reviews"
        description="Reviewers are never the author or approver of the finding under appeal."
      />
      <ReviewDashboard staffRole={staff.role} lockedType="appeal_review" />
    </div>
  );
}
