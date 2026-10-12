'use client';

import type { MemberAccount } from '@blacklist/contracts';
import { useState } from 'react';
import { FormAlert, type FormAlertState } from '@/components/auth/form-alert';
import { LoadingStatus } from '@/components/states/skeletons';
import { ProtectedAction, useProtectedAction } from '@/components/staff/protected-action';
import { AccessDenied, StaffLoadError } from '@/components/staff/staff-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getAdminApi } from '@/lib/api/browser';
import type { AdminApi } from '@/lib/api/types';
import { formatDateUtc } from '@/lib/format/date';
import { moderationErrorAlert } from '@/lib/staff/errors';
import { useAdminData, verifyAdminStepUp } from './use-admin-data';

const read = (api: AdminApi) => api.listMembers();

/** Member suspension (user:suspend). A suspended member can read but cannot submit anything. */
export function MembersAdmin() {
  const { load, reload } = useAdminData(read);
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const { request, start: setRequest, close } = useProtectedAction();

  function act(m: MemberAccount, suspend: boolean) {
    setRequest({
      title: suspend ? `Suspend ${m.handle}?` : `Restore ${m.handle}?`,
      description: suspend
        ? 'Their sessions end and they cannot submit reports, appeals or responses. Existing cases continue.'
        : 'They can sign in and submit again.',
      tone: suspend ? 'danger' : 'default',
      reasonLabel: 'Internal reason (staff only)',
      stepUp: {
        action: suspend ? 'user.suspend' : 'user.restore',
        targetId: m.id,
        description: `${suspend ? 'suspend' : 'restore'} member ${m.handle}`,
      },
      run: async (reason) => {
        const api = await getAdminApi();
        const result = suspend
          ? await api.suspendMember(m.id, reason)
          : await api.restoreMember(m.id, reason);
        setAlert(
          result.kind === 'ok'
            ? { kind: 'warning', title: suspend ? 'Member suspended' : 'Member restored' }
            : moderationErrorAlert(result),
        );
        await reload();
      },
    });
  }

  if (load.kind === 'loading') return <LoadingStatus label="Loading members…" />;
  if (load.kind === 'error') return <StaffLoadError onRetry={() => void reload()} />;
  if (load.kind === 'forbidden') return <AccessDenied detail={load.detail} />;

  return (
    <div className="flex flex-col gap-4">
      <FormAlert state={alert} />
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
        {load.data.map((m) => (
          <li key={m.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2">
                <span className="identifier font-medium break-all text-text">{m.handle}</span>
                <Badge tone={m.status === 'suspended' ? 'danger' : 'positive'}>
                  {m.status === 'suspended' ? 'Suspended' : 'Active'}
                </Badge>
              </p>
              <p className="text-xs text-muted">
                Joined {formatDateUtc(m.joinedAt)} · {m.openSubmissions} open submissions
              </p>
              {m.suspensionReason ? (
                <p className="text-xs break-words text-muted">Internal reason: {m.suspensionReason}</p>
              ) : null}
            </div>
            <Button
              size="sm"
              variant={m.status === 'suspended' ? 'secondary' : 'danger'}
              onClick={() => act(m, m.status !== 'suspended')}
            >
              {m.status === 'suspended' ? 'Restore' : 'Suspend'}
              <span className="sr-only"> {m.handle}</span>
            </Button>
          </li>
        ))}
      </ul>
      <ProtectedAction request={request} onClose={close} verify={verifyAdminStepUp} />
    </div>
  );
}
