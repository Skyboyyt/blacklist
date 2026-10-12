'use client';

import type { StaffRecoveryStatus } from '@blacklist/contracts';
import { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { getStaffSecurityApi } from '@/lib/api/browser';
import { RecoveryProgress } from './recovery-progress';
import { SecurityBanner } from './security-banner';

/**
 * Staff who lost every authenticator cannot recover themselves: an administrator
 * opens a case and the two-person process runs (identity §10.11). This page explains
 * that and, when the API reports an open case for this browser's flow, shows progress.
 * There is no self-service or emergency bypass here.
 */
export function StaffRecoveryInfo() {
  const [status, setStatus] = useState<StaffRecoveryStatus | null | 'loading'>('loading');

  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await (await getStaffSecurityApi()).getRecoveryStatus().catch(() => null);
      if (active) setStatus(result);
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-5 text-sm">
      <p className="text-muted">
        If you lost all your security keys and passkeys, contact a Blacklist administrator through your
        organization’s usual channel. Recovery is deliberately slow and involves several people, so that no
        one can take over a staff account quickly.
      </p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-muted">
        <li>Two staff members verify your identity, and a second administrator approves.</li>
        <li>A 24-hour objection window follows, and your account email is notified.</li>
        <li>You then enroll again with a new password and two new authenticators.</li>
        <li>Your enrollment code is sent only through the channel used to verify your identity.</li>
      </ul>
      {status === 'loading' ? <Spinner size="sm" label="Checking for an open recovery case…" /> : null}
      {status && status !== 'loading' ? (
        <div className="flex flex-col gap-4">
          <SecurityBanner kind="recovery_pending" title="A recovery case is open for your account">
            You will receive emails as it progresses. You cannot sign in to the staff area until recovery is
            complete.
          </SecurityBanner>
          <RecoveryProgress status={status} />
        </div>
      ) : null}
    </div>
  );
}
