'use client';

import type { AccountActionResult, SessionSummary } from '@blacklist/contracts';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { accountErrorAlert, type FormAlertState } from '@/components/auth/form-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { formatDateTimeUtc } from '@/lib/format/date';

interface SessionListProps {
  readonly sessions: readonly SessionSummary[];
  readonly onRevoke: (sessionId: string) => Promise<AccountActionResult>;
  /** Called after a revoke settles so the list can reload from the API. */
  readonly onChanged: () => void;
}

/**
 * Signed-in sessions with coarse device summaries and times (no IPs or locations).
 * Revoking one is confirmed; the current session can only be ended with Sign out.
 */
export function SessionList({ sessions, onRevoke, onChanged }: SessionListProps) {
  const [target, setTarget] = useState<SessionSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function revoke(): Promise<FormAlertState | null> {
    if (!target) return null;
    const result = await onRevoke(target.id);
    if (result.kind === 'ok') {
      setNotice(`${target.deviceSummary} was signed out.`);
      onChanged();
      return null;
    }
    if (result.code === 'session_not_found') {
      // Already gone: not a failure from the user's point of view.
      setNotice(`${target.deviceSummary} had already ended.`);
      onChanged();
      return null;
    }
    return accountErrorAlert(result);
  }

  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="min-h-5 text-sm text-positive">
        {notice}
      </p>
      <ul className="flex flex-col gap-2">
        {sessions.map((s) => (
          <li
            key={s.id}
            className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-start gap-3">
              <Icon name="monitor" className="mt-0.5 size-5 shrink-0 text-muted" />
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-text">
                  {s.deviceSummary}
                  {s.current ? <Badge tone="accent">This device</Badge> : null}
                </p>
                <p className="text-xs text-muted">
                  Signed in <time dateTime={s.createdAt}>{formatDateTimeUtc(s.createdAt)}</time> · Last active{' '}
                  <time dateTime={s.lastActiveAt}>{formatDateTimeUtc(s.lastActiveAt)}</time>
                </p>
              </div>
            </div>
            {s.current ? (
              <span className="text-xs text-muted">Use Sign out to end this session</span>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setTarget(s)}
                aria-label={`Sign out ${s.deviceSummary}`}
              >
                Sign out
              </Button>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        title="Sign out this session?"
        description={target ? `${target.deviceSummary} will be signed out of Blacklist.` : ''}
        consequences="Anyone using that session will need to sign in again. Your account and saved data are not affected."
        confirmLabel="Sign out session"
        pendingLabel="Signing out…"
        onConfirm={revoke}
      />
    </div>
  );
}
