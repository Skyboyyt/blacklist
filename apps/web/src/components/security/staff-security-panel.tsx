'use client';

import { STAFF_MIN_AUTHENTICATORS, type StaffAuthenticator, type StaffSecurity } from '@blacklist/contracts';
import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { DataCard } from '@/components/app/data-card';
import { accountErrorAlert, type FormAlertState } from '@/components/auth/form-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Spinner } from '@/components/ui/spinner';
import { getStaffSecurityApi } from '@/lib/api/browser';
import { formatDateTimeUtc, formatDateUtc } from '@/lib/format/date';
import { SecurityBanner } from './security-banner';
import { SessionExpiredPanel } from './session-expired-panel';
import { StepUpDialog } from './step-up-dialog';

type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: StaffSecurity }
  | { readonly status: 'ended' }
  | { readonly status: 'error' };

/**
 * Staff security keys and passkeys (identity §10.1–§10.2, §10.10). Removing one is a
 * dangerous action: it needs a fresh, action-bound verification first. Presentation
 * only: staff permissions are enforced by the API.
 */
export function StaffSecurityPanel() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [removing, setRemoving] = useState<StaffAuthenticator | null>(null);
  const [verifiedFor, setVerifiedFor] = useState<StaffAuthenticator | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await (await getStaffSecurityApi()).getStaffSecurity();
      if (res.kind === 'ok') setState({ status: 'ready', data: res.data });
      else setState(res.code === 'session_expired' ? { status: 'ended' } : { status: 'error' });
    } catch {
      setState({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch from the API
    void load();
  }, [load]);

  async function remove(): Promise<FormAlertState | null> {
    if (!verifiedFor) return null;
    const res = await (await getStaffSecurityApi()).removeAuthenticator(verifiedFor.id);
    if (res.kind === 'ok') {
      setVerifiedFor(null);
      void load();
      return null;
    }
    return accountErrorAlert(res);
  }

  if (state.status === 'loading') return <Spinner label="Loading security keys…" />;
  if (state.status === 'ended') return <SessionExpiredPanel reason="staff_verification_expired" />;
  if (state.status === 'error')
    return <p className="text-sm text-muted">Security keys can’t be shown right now. Try again later.</p>;

  const { authenticators, authenticatorDeficitSince } = state.data;
  const synced = authenticators.filter((a) => a.synced).length;
  return (
    <div className="flex flex-col gap-6">
      {authenticators.length < STAFF_MIN_AUTHENTICATORS ? (
        <SecurityBanner
          kind="staff_verification_required"
          title={`Staff accounts need at least ${STAFF_MIN_AUTHENTICATORS} security keys or passkeys`}
        >
          Add a replacement soon.{' '}
          {authenticatorDeficitSince
            ? `Staff permissions are suspended 7 days after ${formatDateUtc(authenticatorDeficitSince)} if fewer than two remain.`
            : ''}
        </SecurityBanner>
      ) : null}

      <DataCard
        title="Security keys and passkeys"
        description="Used to verify staff sign-ins and to confirm sensitive staff actions."
      >
        <ul className="flex flex-col gap-2">
          {authenticators.map((a) => (
            <li
              key={a.id}
              className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3">
                <Icon name="key" className="mt-0.5 size-5 shrink-0 text-muted" />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-text">
                    {a.label}
                    <Badge>{a.kind === 'security_key' ? 'Security key' : 'Passkey'}</Badge>
                    {a.synced ? <Badge tone="info">Synced</Badge> : null}
                  </p>
                  <p className="text-xs text-muted">
                    Added {formatDateUtc(a.registeredAt)}
                    {a.lastUsedAt ? ` · Last used ${formatDateTimeUtc(a.lastUsedAt)}` : ' · Not used yet'}
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setRemoving(a)}
                aria-label={`Remove ${a.label}`}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        {synced > 0 ? (
          <p className="mt-3 text-xs text-muted">
            Synced passkeys can be lost together with the account that syncs them. Keep at least one
            authenticator in a different place, such as a hardware security key.
          </p>
        ) : null}
        <p className="mt-3 text-xs text-muted">
          Adding a new authenticator happens through an administrator-issued enrollment link.
        </p>
      </DataCard>

      <StepUpDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        actionDescription={removing ? `remove “${removing.label}”` : 'remove this authenticator'}
        action="staff.authenticator.remove"
        targetId={removing?.id ?? ''}
        onVerified={() => {
          setVerifiedFor(removing);
          setRemoving(null);
        }}
      />
      <ConfirmDialog
        open={verifiedFor !== null}
        onOpenChange={(open) => {
          if (!open) setVerifiedFor(null);
        }}
        title="Remove this authenticator?"
        description={
          verifiedFor
            ? `“${verifiedFor.label}” will no longer be able to sign in or confirm staff actions.`
            : ''
        }
        consequences={
          authenticators.length - 1 < STAFF_MIN_AUTHENTICATORS
            ? 'You will have fewer than two. Add a replacement within 7 days or staff permissions are suspended.'
            : undefined
        }
        confirmLabel="Remove"
        pendingLabel="Removing…"
        tone="danger"
        onConfirm={remove}
      />
    </div>
  );
}
