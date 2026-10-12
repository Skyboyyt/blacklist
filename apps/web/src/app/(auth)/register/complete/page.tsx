import type { Metadata } from 'next';
import { AuthHeading } from '@/components/auth/auth-heading';
import { RegisterCompleteForm } from '@/components/auth/register-complete-form';

export const metadata: Metadata = { title: 'Finish creating your account', referrer: 'no-referrer' };

export default function RegisterCompletePage() {
  return (
    <>
      <AuthHeading title="Finish creating your account" description="Choose a handle and a password." />
      <RegisterCompleteForm />
    </>
  );
}
