'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { ButtonLink } from '@/components/ui/button';
import { getStaffSecurityApi } from '@/lib/api/browser';
import { usePasskeyCeremony } from '@/lib/security/use-passkey-ceremony';
import { PasskeyPrompt } from './passkey-prompt';

/**
 * Staff sign-in step 2 (identity §10.6): after the password, a WebAuthn assertion
 * within 5 minutes. Until it succeeds the session has no staff permissions.
 */
export function StaffVerify() {
  const router = useRouter();
  const run = useCallback(async () => (await getStaffSecurityApi()).verifyPasskey({ kind: 'sign_in' }), []);
  const { state, start } = usePasskeyCeremony(run);

  async function verify() {
    if ((await start()) === 'verified') {
      router.push('/mod');
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PasskeyPrompt
        state={state}
        onStart={verify}
        startLabel="Use security key or passkey"
        successText="Verified. Opening the staff area…"
      />
      {state.status === 'session_expired' ? (
        <ButtonLink href="/login?reason=staff_verification_expired" variant="secondary">
          Sign in again
        </ButtonLink>
      ) : null}
      <p className="text-xs text-muted">
        Lost all your authenticators?{' '}
        <Link href="/staff/recovery" className="font-medium text-accent hover:underline">
          How staff recovery works
        </Link>
      </p>
    </div>
  );
}
