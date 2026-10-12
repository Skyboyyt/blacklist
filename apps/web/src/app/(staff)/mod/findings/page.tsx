import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/page-header';
import { FindingsView } from '@/components/staff/findings-view';

export const metadata: Metadata = { title: 'Published findings' };

export default function FindingsPage() {
  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="Published findings"
        description="Emergency suspension removes a finding from scoring at once, pending review by a non-participant within 72 hours."
      />
      <FindingsView />
    </div>
  );
}
