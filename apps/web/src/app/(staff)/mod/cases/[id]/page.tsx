import type { Metadata } from 'next';
import { CaseWorkspace } from '@/components/staff/case-workspace';
import { StaffOnly } from '@/components/states/access-states';
import { safeDecodeSegment } from '@/lib/format/address';
import { getStaffViewer } from '@/lib/staff/staff-page';

interface CasePageProps {
  readonly params: Promise<{ id: string }>;
}

export const metadata: Metadata = { title: 'Case review' };

export default async function CasePage({ params }: CasePageProps) {
  const { id } = await params;
  const staff = await getStaffViewer();
  if (!staff) return <StaffOnly />;
  const caseId = safeDecodeSegment(id).slice(0, 40);
  return <CaseWorkspace key={caseId} caseId={caseId} staffRole={staff.role} myHandle={staff.handle} />;
}
