'use client';

import { useAccountSecurity } from '@/lib/security/use-account-security';
import { AccountSecurityLoader } from './account-security-loader';
import { EmailChangeFlow } from './email-change-flow';

/** Loads the account (email, cooling period) and runs the email-change flow. */
export function EmailChangePanel() {
  const { state, reload } = useAccountSecurity();
  return (
    <AccountSecurityLoader state={state} onRetry={() => void reload()}>
      {(data) => <EmailChangeFlow security={data} />}
    </AccountSecurityLoader>
  );
}
