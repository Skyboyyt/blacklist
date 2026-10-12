'use client';

import type { AccountSecurity } from '@blacklist/contracts';
import type { ReactNode } from 'react';
import { ErrorState } from '@/components/app/error-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { accountErrorCopy } from '@/lib/auth/account-error-copy';
import type { AccountSecurityState } from '@/lib/security/use-account-security';
import { SessionExpiredPanel } from './session-expired-panel';

interface AccountSecurityLoaderProps {
  readonly state: AccountSecurityState;
  readonly onRetry: () => void;
  readonly children: (data: AccountSecurity) => ReactNode;
}

/** Shared loading, session-ended and error presentation for security pages. */
export function AccountSecurityLoader({ state, onRetry, children }: AccountSecurityLoaderProps) {
  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <Spinner size="sm" />
          Loading your security settings…
        </p>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (state.status === 'error') {
    if (state.error.code === 'session_expired') return <SessionExpiredPanel />;
    const copy = accountErrorCopy(state.error);
    return (
      <ErrorState
        title={copy.title}
        description={copy.body}
        action={
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    );
  }
  return <>{children(state.data)}</>;
}
