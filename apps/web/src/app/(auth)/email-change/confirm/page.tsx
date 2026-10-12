import type { Metadata } from 'next';
import { AuthHeading } from '@/components/auth/auth-heading';
import { EmailChangeConfirm } from '@/components/auth/email-change-confirm';

export const metadata: Metadata = { title: 'Confirm email change', referrer: 'no-referrer' };

export default function EmailChangeConfirmPage() {
  return (
    <>
      <AuthHeading title="Confirm email change" />
      <EmailChangeConfirm />
    </>
  );
}
