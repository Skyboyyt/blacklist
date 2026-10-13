import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/page-header';
import { FindingRevisionEditor } from '@/components/staff/finding-revision-editor';
import { StaffOnly } from '@/components/states/access-states';
import { safeDecodeSegment } from '@/lib/format/address';
import { getStaffViewer } from '@/lib/staff/staff-page';

interface FindingPageProps {
  readonly params: Promise<{ id: string }>;
}

export const metadata: Metadata = { title: 'Finding revisions' };

export default async function FindingPage({ params }: FindingPageProps) {
  const { id } = await params;
  const staff = await getStaffViewer();
  if (!staff) return <StaffOnly />;
  const findingId = safeDecodeSegment(id).slice(0, 60);
  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="Finding revisions"
        description="Every change is a new immutable revision. The public text changes only after that exact revision is approved."
      />
      <FindingRevisionEditor key={findingId} findingId={findingId} />
    </div>
  );
}
