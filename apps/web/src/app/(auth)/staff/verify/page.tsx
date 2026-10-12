import type { Metadata } from 'next';
import { AuthHeading } from '@/components/auth/auth-heading';
import { StaffVerify } from '@/components/security/staff-verify';

export const metadata: Metadata = { title: 'Staff verification' };

export default function StaffVerifyPage() {
  return (
    <>
      <AuthHeading
        title="Verify with your passkey"
        description="Staff accounts confirm every sign-in with a registered security key or passkey. You have 5 minutes."
      />
      <StaffVerify />
    </>
  );
}
