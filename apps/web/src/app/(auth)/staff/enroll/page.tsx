import type { Metadata } from 'next';
import { AuthHeading } from '@/components/auth/auth-heading';
import { StaffEnrollmentFlow } from '@/components/security/staff-enrollment-flow';

export const metadata: Metadata = { title: 'Staff enrollment', referrer: 'no-referrer' };

export default function StaffEnrollPage() {
  return (
    <>
      <AuthHeading
        title="Set up your staff account"
        description="You’ll need the enrollment code from your administrator and two security keys or passkeys."
      />
      <StaffEnrollmentFlow />
    </>
  );
}
