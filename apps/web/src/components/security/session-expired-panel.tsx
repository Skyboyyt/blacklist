'use client';

import { usePathname } from 'next/navigation';
import { ButtonLink } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { safeNextPath } from '@/lib/auth/safe-redirect';

export type SessionEndReason = 'session_expired' | 'staff_verification_expired';

const COPY: Record<SessionEndReason, { title: string; body: string }> = {
  session_expired: {
    title: 'Your session has ended',
    body: 'For your security, sessions end after a period of inactivity or when they are signed out elsewhere. Sign in again to continue. Anything already saved to your account is unaffected.',
  },
  staff_verification_expired: {
    title: 'Your staff verification has ended',
    body: 'Staff sessions need a fresh passkey verification after they end. Sign in again and verify with your security key or passkey.',
  },
};

/**
 * Reusable session-ended experience. The return path is the current page, passed
 * through the same same-origin validation as every `next` value; anything unsafe
 * falls back to the dashboard.
 */
export function SessionExpiredPanel({ reason = 'session_expired' }: { readonly reason?: SessionEndReason }) {
  const pathname = usePathname();
  const next = safeNextPath(pathname);
  const href = `/login?${new URLSearchParams({ reason, next }).toString()}`;
  const copy = COPY[reason];
  return (
    <section
      aria-labelledby="session-ended-title"
      className="mx-auto flex max-w-md flex-col items-center gap-3 py-10 text-center"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Icon name="clock" className="size-6" />
      </span>
      <h1 id="session-ended-title" className="text-xl font-semibold text-text">
        {copy.title}
      </h1>
      <p className="text-sm text-muted">{copy.body}</p>
      <ButtonLink href={href}>Sign in again</ButtonLink>
    </section>
  );
}
