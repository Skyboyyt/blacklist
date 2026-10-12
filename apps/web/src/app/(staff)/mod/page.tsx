import type { Metadata } from 'next';
import { StaffPlaceholder } from '@/components/states/staff-placeholder';

export const metadata: Metadata = { title: 'Moderation queue' };

export default function ModerationQueuePage() {
  return <StaffPlaceholder title="Moderation queue" description="Reports and cases awaiting review." />;
}
