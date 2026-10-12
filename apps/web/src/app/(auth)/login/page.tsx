import type { Metadata } from 'next';
import { AuthHeading } from '@/components/auth/auth-heading';
import { LoginForm } from '@/components/auth/login-form';
import { safeNextPath } from '@/lib/auth/safe-redirect';

export const metadata: Metadata = { title: 'Sign in' };

interface LoginPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const rawNext = typeof params['next'] === 'string' ? params['next'] : undefined;
  const reason = params['reason'];
  const endedReason =
    reason === 'session_expired' || reason === 'staff_verification_expired' ? reason : undefined;
  return (
    <>
      <AuthHeading
        title="Sign in"
        description="Sign in to report scams, file appeals and track your reports."
      />
      <LoginForm next={safeNextPath(rawNext)} endedReason={endedReason} />
    </>
  );
}
