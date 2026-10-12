'use client';

import Link from 'next/link';
import { getAuthApi } from '@/lib/api/browser';
import { EmailRequestForm } from './email-request-form';

export function ForgotPassword() {
  return (
    <EmailRequestForm
      idPrefix="forgot"
      submitLabel="Send reset link"
      submittingLabel="Sending…"
      send={async (email) => (await getAuthApi()).forgotPassword({ email })}
      sentTitle="Check your email"
      sentBody={
        <>
          <p>
            If an account exists for this address, we sent instructions to reset your password. The link
            expires soon and works once.
          </p>
          <p className="mt-2">Can’t find it? Check your spam folder, or try again in a few minutes.</p>
        </>
      }
      footer={
        <p className="text-center text-sm text-muted">
          <Link href="/login" className="font-medium text-accent hover:underline">
            Back to sign in
          </Link>
        </p>
      }
    />
  );
}
