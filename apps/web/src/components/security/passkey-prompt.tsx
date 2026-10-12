'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Spinner } from '@/components/ui/spinner';
import type { PasskeyCeremonyState } from '@/lib/security/use-passkey-ceremony';

const COPY: Record<
  Exclude<PasskeyCeremonyState['status'], 'idle' | 'waiting' | 'verified'>,
  { title: string; body: string }
> = {
  cancelled: { title: 'Verification was cancelled', body: 'Nothing happened. Try again when you are ready.' },
  timed_out: {
    title: 'Verification timed out',
    body: 'The request expired before your security key or passkey responded. Try again.',
  },
  unsupported: {
    title: 'This browser can’t use passkeys',
    body: 'Use an up-to-date browser that supports security keys and passkeys, on a device with your registered authenticator.',
  },
  failed: {
    title: 'Verification didn’t succeed',
    body: 'Make sure you use a registered security key or passkey, then try again.',
  },
  session_expired: { title: 'Your session has ended', body: 'Sign in again to continue.' },
};

interface PasskeyPromptProps {
  readonly state: PasskeyCeremonyState;
  readonly onStart: () => void;
  readonly startLabel: string;
  readonly successText: ReactNode;
}

/**
 * Presents a WebAuthn ceremony: waiting for the authenticator, and every outcome
 * with a clear retry path. Status changes are announced once (role="status").
 */
export function PasskeyPrompt({ state, onStart, startLabel, successText }: PasskeyPromptProps) {
  const status = state.status;
  return (
    <div className="flex flex-col gap-4">
      <div role="status" aria-live="polite" className="min-h-6 text-sm">
        {status === 'waiting' ? (
          <p className="flex items-center gap-2 text-text">
            <Spinner size="sm" />
            Waiting for your security key or passkey. Follow your browser’s prompt.
          </p>
        ) : status === 'verified' ? (
          <p className="flex items-center gap-2 text-positive">
            <Icon name="check" className="size-4" />
            {successText}
          </p>
        ) : status !== 'idle' ? (
          <div
            className="rounded-md border border-border-strong bg-surface-2 p-3"
            data-passkey-status={status}
          >
            <p className="font-medium text-text">{COPY[status].title}</p>
            <p className="mt-0.5 text-muted">{COPY[status].body}</p>
          </div>
        ) : null}
      </div>
      {status !== 'verified' && status !== 'session_expired' && status !== 'unsupported' ? (
        <Button
          size="lg"
          onClick={onStart}
          loading={status === 'waiting'}
          loadingLabel="Waiting for authenticator…"
          className="w-full"
        >
          <Icon name="shield" className="size-4" />
          {status === 'idle' ? startLabel : 'Try again'}
        </Button>
      ) : null}
    </div>
  );
}
