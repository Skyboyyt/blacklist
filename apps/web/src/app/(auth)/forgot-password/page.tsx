import type { Metadata } from 'next';
import { AuthHeading } from '@/components/auth/auth-heading';
import { ForgotPassword } from '@/components/auth/forgot-password';

export const metadata: Metadata = { title: 'Reset your password' };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading
        title="Reset your password"
        description="Enter your account email and we’ll send a reset link."
      />
      <ForgotPassword />
    </>
  );
}
