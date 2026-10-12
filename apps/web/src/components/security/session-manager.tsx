'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { DataCard } from '@/components/app/data-card';
import { accountErrorAlert, type FormAlertState } from '@/components/auth/form-alert';
import { Button } from '@/components/ui/button';
import { getAccountApi } from '@/lib/api/browser';
import { useAccountSecurity } from '@/lib/security/use-account-security';
import { AccountSecurityLoader } from './account-security-loader';
import { ReauthDialog } from './reauth-dialog';
import { SessionList } from './session-list';

/**
 * Sessions page: list, revoke one, and revoke all others. Revoking all others needs
 * fresh re-authentication (identity §9); the dialog asks for it only when the API says so.
 */
export function SessionManager() {
  const { state, reload } = useAccountSecurity();
  const [confirmAll, setConfirmAll] = useState(false);
  const [reauth, setReauth] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function revokeOthers(): Promise<FormAlertState | null> {
    const res = await (await getAccountApi()).revokeOtherSessions();
    if (res.kind === 'ok') {
      setNotice('All other sessions were signed out.');
      void reload();
      return null;
    }
    if (res.code === 'reauth_required') {
      setConfirmAll(false);
      setReauth(true);
      return null;
    }
    return accountErrorAlert(res);
  }

  return (
    <AccountSecurityLoader state={state} onRetry={() => void reload()}>
      {(data) => {
        const others = data.sessions.filter((s) => !s.current).length;
        return (
          <DataCard
            title="Where you’re signed in"
            description="Sessions end automatically after 7 days of inactivity or 30 days in total."
            actions={
              others > 0 ? (
                <Button variant="secondary" size="sm" onClick={() => setConfirmAll(true)}>
                  Sign out all other sessions
                </Button>
              ) : null
            }
          >
            <p role="status" className="mb-2 min-h-5 text-sm text-positive">
              {notice}
            </p>
            <SessionList
              sessions={data.sessions}
              onRevoke={async (id) => (await getAccountApi()).revokeSession(id)}
              onChanged={() => void reload()}
            />
            <ConfirmDialog
              open={confirmAll}
              onOpenChange={setConfirmAll}
              title="Sign out all other sessions?"
              description={`${others === 1 ? '1 other session' : `${others} other sessions`} will be signed out.`}
              consequences="This device stays signed in. Use this if you signed in somewhere you no longer trust."
              confirmLabel="Sign out others"
              pendingLabel="Signing out…"
              onConfirm={revokeOthers}
            />
            <ReauthDialog
              open={reauth}
              onOpenChange={setReauth}
              purpose="sign out your other sessions"
              onConfirmed={() => setConfirmAll(true)}
            />
          </DataCard>
        );
      }}
    </AccountSecurityLoader>
  );
}
