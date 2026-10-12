'use client';

import Link from 'next/link';
import { getAuthApi } from '@/lib/api/browser';
import { EmailRequestForm } from './email-request-form';

export function RegisterStart() {
  return (
    <EmailRequestForm
      idPrefix="register"
      submitLabel="Continue"
      submittingLabel="Sending…"
      send={async (email) => (await getAuthApi()).registerStart({ email })}
      sentTitle="Check your email"
      sentBody={
        <>
          <p>
            If this address can be used, we sent a link to finish creating your account. The link expires in
            30 minutes.
          </p>
          <p className="mt-2">Can’t find it? Check your spam folder, or try again in a few minutes.</p>
        </>
      }
      footer={
        <p className="text-center text-sm text-muted">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </p>
      }
    />
  );
}
