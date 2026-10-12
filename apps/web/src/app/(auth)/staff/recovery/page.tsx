import type { Metadata } from 'next';
import { AuthHeading } from '@/components/auth/auth-heading';
import { StaffRecoveryInfo } from '@/components/security/staff-recovery-info';

export const metadata: Metadata = { title: 'Staff account recovery' };

export default function StaffRecoveryPage() {
  return (
    <>
      <AuthHeading title="Staff account recovery" />
      <StaffRecoveryInfo />
    </>
  );
}
