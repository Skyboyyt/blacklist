import type { Metadata } from 'next';
import { AuthHeading } from '@/components/auth/auth-heading';
import { RegisterStart } from '@/components/auth/register-start';

export const metadata: Metadata = { title: 'Create account' };

export default function RegisterPage() {
  return (
    <>
      <AuthHeading
        title="Create an account"
        description="During testing, sign-up is by invitation only. Start with the email you were invited with. We’ll send a link to choose your handle and password."
      />
      <RegisterStart />
    </>
  );
}
