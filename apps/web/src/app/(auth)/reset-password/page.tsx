import type { Metadata } from 'next';
import { AuthHeading } from '@/components/auth/auth-heading';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export const metadata: Metadata = { title: 'Choose a new password', referrer: 'no-referrer' };

export default function ResetPasswordPage() {
  return (
    <>
      <AuthHeading
        title="Choose a new password"
        description="Changing your password signs you out everywhere."
      />
      <ResetPasswordForm />
    </>
  );
}
