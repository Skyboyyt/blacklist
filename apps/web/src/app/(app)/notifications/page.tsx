import type { Metadata } from 'next';
import { DataCard } from '@/components/app/data-card';
import { PageHeader } from '@/components/app/page-header';
import { MyNotices } from '@/components/submissions/my-submissions';

export const metadata: Metadata = { title: 'Notifications' };

export default function NotificationsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description="Updates about your own submissions. Only you can see them."
      />
      <DataCard>
        <MyNotices />
      </DataCard>
    </div>
  );
}
