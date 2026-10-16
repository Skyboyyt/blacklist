import type { Metadata } from 'next';
import { AuthHeading } from '@/components/auth/auth-heading';
import { RecoveryObjection } from '@/components/auth/recovery-objection';

export const metadata: Metadata = { title: 'Object to a staff recovery', referrer: 'no-referrer' };

export default function RecoveryObjectionPage() {
  return (
    <>
      <AuthHeading title="Object to a staff account recovery" />
      <RecoveryObjection />
    </>
  );
}
