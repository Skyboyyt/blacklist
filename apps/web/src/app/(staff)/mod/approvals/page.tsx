import type { Metadata } from 'next';
import { StaffPlaceholder } from '@/components/states/staff-placeholder';

export const metadata: Metadata = { title: 'Approvals' };

export default function ApprovalsPage() {
  return (
    <StaffPlaceholder
      title="Approvals"
      description="Finding revisions awaiting approval. Severe findings need an independent approver."
    />
  );
}
