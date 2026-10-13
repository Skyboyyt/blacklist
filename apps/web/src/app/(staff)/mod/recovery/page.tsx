import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/page-header';
import { RecoveryVerificationView } from '@/components/staff/recovery-verification-view';

export const metadata: Metadata = { title: 'Recovery verification' };

export default function RecoveryVerificationPage() {
  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="Recovery verification"
        description="Confirm a colleague’s identity before their staff access is restored. Two staff members verify, at least one an administrator."
      />
      <RecoveryVerificationView />
    </div>
  );
}
