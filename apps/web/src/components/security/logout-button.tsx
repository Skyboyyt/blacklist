'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { getAccountApi } from '@/lib/api/browser';
import { cn } from '@/lib/cn';

/**
 * Sign out (POST in the future API; never a GET link). On success the browser goes to
 * the research home, a safe public page. A failure keeps the user signed in and says so.
 */
export function LogoutButton({
  className,
  fullWidth = false,
}: {
  readonly className?: string;
  readonly fullWidth?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      const result = await (await getAccountApi()).logout();
      if (result.kind === 'ok') {
        router.push('/');
        router.refresh();
        return;
      }
      setFailed(true);
    } catch {
      setFailed(true);
    }
    setPending(false);
  }

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Button
        variant="ghost"
        size="sm"
        onClick={signOut}
        loading={pending}
        loadingLabel="Signing out…"
        className={cn('justify-start', fullWidth && 'w-full')}
      >
        <Icon name="logout" className="size-4" />
        Sign out
      </Button>
      {failed ? (
        <p role="alert" className="px-3 text-xs text-danger">
          Couldn’t sign out. You are still signed in; try again.
        </p>
      ) : null}
    </div>
  );
}
