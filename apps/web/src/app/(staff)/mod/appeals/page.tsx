import type { Metadata } from 'next';
import { StaffPlaceholder } from '@/components/states/staff-placeholder';

export const metadata: Metadata = { title: 'Appeal reviews' };

export default function AppealReviewsPage() {
  return (
    <StaffPlaceholder
      title="Appeal reviews"
      description="Appeals assigned to you. Reviewers are never the author or approver of the finding."
    />
  );
}
