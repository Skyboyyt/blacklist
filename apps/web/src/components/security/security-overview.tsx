'use client';

import Link from 'next/link';
import { DataCard } from '@/components/app/data-card';
import { ButtonLink } from '@/components/ui/button';
import { formatDateUtc } from '@/lib/format/date';
import { useAccountSecurity } from '@/lib/security/use-account-security';
import { AccountSecurityLoader } from './account-security-loader';
import { CoolingPeriodNotice } from './cooling-period-notice';
import { LogoutButton } from './logout-button';
import { SecurityActivity } from './security-activity';

/** Account security overview: password, email, sessions, activity and recovery. */
export function SecurityOverview() {
  const { state, reload } = useAccountSecurity();
  return (
    <AccountSecurityLoader state={state} onRetry={() => void reload()}>
      {(data) => {
        const others = data.sessions.filter((s) => !s.current).length;
        return (
          <div className="flex flex-col gap-6">
            {data.cooling ? <CoolingPeriodNotice cooling={data.cooling} /> : null}

            <div className="grid gap-6 md:grid-cols-2">
              <DataCard
                title="Password"
                actions={
                  <ButtonLink href="/settings/security/password" variant="secondary" size="sm">
                    Change
                  </ButtonLink>
                }
              >
                <p className="text-sm text-muted">
                  {data.passwordChangedAt
                    ? `Last changed ${formatDateUtc(data.passwordChangedAt)}.`
                    : 'Set when you created your account.'}{' '}
                  Blacklist never asks you to change it on a schedule.
                </p>
              </DataCard>

              <DataCard
                title="Email address"
                actions={
                  data.cooling ? null : (
                    <ButtonLink href="/settings/security/email" variant="secondary" size="sm">
                      Change
                    </ButtonLink>
                  )
                }
              >
                <p className="text-sm text-text">{data.email}</p>
                <p className="mt-1 text-xs text-muted">
                  Used for sign-in and security notices. Never shown to anyone else.
                </p>
              </DataCard>

              <DataCard
                title="Sessions"
                actions={
                  <ButtonLink href="/settings/security/sessions" variant="secondary" size="sm">
                    Manage
                  </ButtonLink>
                }
              >
                <p className="text-sm text-muted">
                  Signed in on this device
                  {others > 0 ? ` and ${others === 1 ? '1 other' : `${others} others`}` : ' only'}.
                </p>
              </DataCard>

              <DataCard title="Account recovery">
                <p className="text-sm text-muted">
                  If you forget your password, use{' '}
                  <Link href="/forgot-password" className="font-medium text-accent hover:underline">
                    Forgot password
                  </Link>{' '}
                  on the sign-in page; a reset link goes to your email. Blacklist will never ask for your seed
                  phrase or private key.
                </p>
              </DataCard>

              {data.accountKind === 'staff' ? (
                <DataCard
                  title="Security keys and passkeys"
                  actions={
                    <ButtonLink href="/settings/security/staff" variant="secondary" size="sm">
                      Manage
                    </ButtonLink>
                  }
                >
                  <p className="text-sm text-muted">
                    Staff accounts sign in with a password and a registered security key or passkey.
                  </p>
                </DataCard>
              ) : null}
            </div>

            <DataCard title="Recent security activity" description="Visible only to you.">
              <SecurityActivity events={data.recentEvents} />
            </DataCard>

            <div className="flex justify-start">
              <LogoutButton />
            </div>
          </div>
        );
      }}
    </AccountSecurityLoader>
  );
}
