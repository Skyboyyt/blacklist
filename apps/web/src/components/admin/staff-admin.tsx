'use client';

import {
  STAFF_ROLES,
  invitationRequestSchema,
  type Invitation,
  type RecoveryCase,
  type RoleRequest,
  type StaffMember,
  type StaffRole,
} from '@blacklist/contracts';
import { useCallback, useState, type FormEvent } from 'react';
import { FormAlert, type FormAlertState } from '@/components/auth/form-alert';
import { DataCard } from '@/components/app/data-card';
import { Notice } from '@/components/app/notice';
import { LoadingStatus } from '@/components/states/skeletons';
import { ProtectedAction, useProtectedAction } from '@/components/staff/protected-action';
import { AccessDenied, StaffLoadError } from '@/components/staff/staff-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { getAdminApi } from '@/lib/api/browser';
import type { AdminApi, ModerationResult } from '@/lib/api/types';
import { formatDateTimeUtc } from '@/lib/format/date';
import { moderationErrorAlert } from '@/lib/staff/errors';
import { ROLE_LABEL } from '@/lib/staff/permissions';
import { useAdminData, verifyAdminStepUp } from './use-admin-data';

interface StaffData {
  readonly staff: readonly StaffMember[];
  readonly invitations: readonly Invitation[];
  readonly requests: readonly RoleRequest[];
  readonly recoveries: readonly RecoveryCase[];
}

/** Reads the four staff-lifecycle lists together, so the page always shows one consistent state. */
async function read(api: AdminApi): Promise<ModerationResult<StaffData>> {
  const [staff, invitations, requests, recoveries] = await Promise.all([
    api.listStaff(),
    api.listInvitations(),
    api.listRoleRequests(),
    api.listRecoveries(),
  ]);
  if (staff.kind !== 'ok') return staff;
  if (invitations.kind !== 'ok') return invitations;
  if (requests.kind !== 'ok') return requests;
  if (recoveries.kind !== 'ok') return recoveries;
  return {
    kind: 'ok',
    data: {
      staff: staff.data,
      invitations: invitations.data,
      requests: requests.data,
      recoveries: recoveries.data,
    },
  };
}

const INVITATION_STATE: Readonly<Record<Invitation['state'], string>> = {
  pending_approval: 'Waiting for a second administrator',
  issued: 'Issued',
  accepted: 'Accepted',
  revoked: 'Revoked',
  expired: 'Expired',
};

const RECOVERY_STATE: Readonly<Record<RecoveryCase['state'], string>> = {
  verifying: 'Collecting identity verifications',
  awaiting_approval: 'Waiting for a different administrator to approve',
  objection_window: '24-hour objection window',
  fresh_enrollment: 'Waiting for a new password and two authenticators',
  objected: 'Blocked by a recovery objection',
  cancelled: 'Cancelled',
  completed: 'Completed: re-enrollment finished',
};

/**
 * Staff lifecycle (identity §10): invitations, role changes, suspension, offboarding and
 * recovery. Privilege increases wait for a second administrator; the service enforces it.
 */
export function StaffAdmin() {
  const { load, reload } = useAdminData(read);
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const { request, start: setRequest, close } = useProtectedAction();
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<StaffRole>('moderator');
  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  const [code, setCode] = useState<string | null>(null);
  const [roleTarget, setRoleTarget] = useState('');
  const [role, setRole] = useState<StaffRole>('moderator');
  const [methods, setMethods] = useState<Record<string, string>>({});

  const report = useCallback(
    async (result: ModerationResult<unknown>, success: string, message?: string) => {
      setAlert(
        result.kind === 'ok'
          ? { kind: 'warning', title: success, ...(message ? { message } : {}) }
          : moderationErrorAlert(result),
      );
      await reload();
    },
    [reload],
  );

  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = invitationRequestSchema.safeParse({ email, role: inviteRole });
    if (!parsed.success) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setEmailError(undefined);
    setRequest({
      title: `Invite a new ${ROLE_LABEL[parsed.data.role].toLowerCase()}?`,
      description:
        parsed.data.role === 'admin'
          ? 'An administrator invitation waits until a second, different administrator approves it.'
          : 'The invitation is issued now and expires after 72 hours.',
      parameters: () => [parsed.data],
      stepUp: { action: 'staff.invite', targetId: 'new', description: 'invite a staff member' },
      run: async () => {
        const result = await (await getAdminApi()).createInvitation(parsed.data);
        if (result.kind === 'ok') {
          setCode(result.data.enrollmentCode);
          setEmail('');
        }
        await report(result, 'Invitation created');
      },
    });
  }

  function changeRole(action: 'grant' | 'revoke') {
    const target = load.kind === 'ready' ? load.data.staff.find((s) => s.id === roleTarget) : undefined;
    if (!target) {
      setAlert({ kind: 'error', title: 'Choose a staff member first' });
      return;
    }
    const waits = action === 'grant' || (role === 'admin' && target.roles.includes('admin'));
    setRequest({
      title: `${action === 'grant' ? 'Grant' : 'Remove'} ${ROLE_LABEL[role]} ${action === 'grant' ? 'to' : 'from'} ${target.handle}?`,
      description: waits
        ? 'This waits for a second, different administrator to approve it.'
        : 'Removing this role takes effect immediately and ends their sessions.',
      tone: action === 'revoke' ? 'danger' : 'default',
      parameters: () => [{ targetId: target.id, role, action }],
      stepUp: { action: 'staff.role', targetId: target.id, description: `change ${target.handle}’s role` },
      run: async () => {
        const result = await (await getAdminApi()).requestRoleChange({ targetId: target.id, role, action });
        await report(result, waits ? 'Role change requested' : 'Role removed');
      },
    });
  }

  function staffAction(m: StaffMember, kind: 'suspend' | 'offboard' | 'recovery') {
    const copy = {
      suspend: {
        title: `Suspend ${m.handle}?`,
        description:
          'Their sessions and staff permissions end immediately. Restoration goes through staff recovery.',
        action: 'staff.suspend',
      },
      offboard: {
        title: `Offboard ${m.handle}?`,
        description:
          'Roles, sessions and authenticators are revoked, their open invitations are revoked, their open cases are released and the account is deactivated.',
        action: 'staff.offboard',
      },
      recovery: {
        title: `Open a recovery case for ${m.handle}?`,
        description:
          'For a staff member who lost all authenticators. Their staff permissions are suspended and authenticators revoked until recovery completes.',
        action: 'staff.recovery.open',
      },
    }[kind];
    setRequest({
      title: copy.title,
      description: copy.description,
      tone: kind === 'recovery' ? 'default' : 'danger',
      ...(kind === 'recovery' ? {} : { reasonLabel: 'Internal reason (staff only)' }),
      parameters: (reason) => (kind === 'recovery' ? [m.id] : [m.id, reason]),
      stepUp: { action: copy.action, targetId: m.id, description: `${kind} ${m.handle}` },
      run: async (reason) => {
        const api = await getAdminApi();
        const result =
          kind === 'suspend'
            ? await api.suspendStaff(m.id, reason)
            : kind === 'offboard'
              ? await api.offboardStaff(m.id, reason)
              : await api.openRecovery(m.id);
        await report(
          result,
          kind === 'suspend'
            ? 'Staff account suspended'
            : kind === 'offboard'
              ? 'Staff account offboarded'
              : 'Recovery case opened',
        );
      },
    });
  }

  function invitationAction(inv: Invitation, kind: 'approve' | 'revoke') {
    setRequest({
      title: kind === 'approve' ? `Approve invitation ${inv.id}?` : `Revoke invitation ${inv.id}?`,
      description:
        kind === 'approve'
          ? `You are the second administrator for this ${ROLE_LABEL[inv.role].toLowerCase()} invitation from ${inv.invitedBy.handle}.`
          : 'The invitation link and enrollment code stop working.',
      tone: kind === 'revoke' ? 'danger' : 'default',
      stepUp: {
        action: kind === 'approve' ? 'staff.invitation.approve' : 'staff.invitation.revoke',
        targetId: inv.id,
        description: `${kind} invitation ${inv.id}`,
      },
      run: async () => {
        const api = await getAdminApi();
        const result =
          kind === 'approve' ? await api.approveInvitation(inv.id) : await api.revokeInvitation(inv.id);
        await report(result, kind === 'approve' ? 'Invitation approved' : 'Invitation revoked');
      },
    });
  }

  function approveRequest(r: RoleRequest) {
    setRequest({
      title: `Approve: ${r.action} ${ROLE_LABEL[r.role]} for ${r.target.handle}?`,
      description: `Proposed by ${r.proposedBy.handle}. You are the second administrator.`,
      stepUp: { action: 'staff.role.approve', targetId: r.id, description: `approve role change ${r.id}` },
      run: async () => report(await (await getAdminApi()).approveRoleRequest(r.id), 'Role change approved'),
    });
  }

  async function cancelRequest(r: RoleRequest) {
    await report(await (await getAdminApi()).cancelRoleRequest(r.id), 'Role change cancelled');
  }

  async function verify(r: RecoveryCase) {
    await report(
      await (await getAdminApi()).verifyRecovery(r.id, methods[r.id] ?? ''),
      'Verification recorded',
    );
  }

  function approveRecovery(r: RecoveryCase) {
    setRequest({
      title: `Approve recovery for ${r.subject.handle}?`,
      description:
        'A 24-hour objection window starts. All administrators and the subject’s email are notified.',
      stepUp: { action: 'staff.recovery.approve', targetId: r.id, description: `approve recovery ${r.id}` },
      run: async () => report(await (await getAdminApi()).approveRecovery(r.id), 'Recovery approved'),
    });
  }

  async function completeRecovery(r: RecoveryCase) {
    const result = await (await getAdminApi()).completeRecovery(r.id);
    if (result.kind === 'ok') setCode(result.data.enrollmentCode);
    await report(
      result,
      'Re-enrollment invitation issued',
      'A re-enrollment invitation was issued. New password and two new authenticators are required.',
    );
  }

  if (load.kind === 'loading') return <LoadingStatus label="Loading staff…" />;
  if (load.kind === 'error') return <StaffLoadError onRetry={() => void reload()} />;
  if (load.kind === 'forbidden') return <AccessDenied detail={load.detail} />;
  const { staff, invitations, requests, recoveries } = load.data;
  const active = staff.filter((s) => s.status !== 'deactivated');

  return (
    <div className="flex flex-col gap-6">
      <FormAlert state={alert} />
      {code ? (
        <Notice tone="warning" title="One-time enrollment code">
          <span className="identifier text-base font-semibold">{code}</span> — shown once. Deliver it through
          a separate, previously verified channel; never in the same message as the invitation link.
          {process.env.NEXT_PUBLIC_API_MODE === 'mock' ? ' This demo code is fictional.' : null}
        </Notice>
      ) : null}

      <DataCard title={`Staff (${staff.length})`}>
        <ul className="flex flex-col divide-y divide-border">
          {staff.map((m) => (
            <li
              key={m.id}
              className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="identifier font-medium break-all text-text">{m.handle}</span>
                  <Badge
                    tone={
                      m.status === 'active' ? 'positive' : m.status === 'suspended' ? 'warning' : 'neutral'
                    }
                  >
                    {m.status === 'active'
                      ? 'Active'
                      : m.status === 'suspended'
                        ? 'Suspended'
                        : 'Deactivated'}
                  </Badge>
                  {m.roles.map((r) => (
                    <Badge key={r} tone="info">
                      {ROLE_LABEL[r]}
                    </Badge>
                  ))}
                </p>
                <p className="text-xs text-muted">
                  {m.emailMasked} · {m.authenticators} authenticator{m.authenticators === 1 ? '' : 's'}
                  {m.authenticators < 2 && m.status === 'active'
                    ? ' (below two: permissions suspend after 7 days)'
                    : ''}
                  {m.lastActiveAt ? ` · last active ${formatDateTimeUtc(m.lastActiveAt)}` : ''}
                </p>
              </div>
              {m.status === 'deactivated' ? null : (
                <div className="flex flex-wrap gap-2">
                  {m.status === 'active' ? (
                    <Button size="sm" variant="secondary" onClick={() => staffAction(m, 'suspend')}>
                      Suspend<span className="sr-only"> {m.handle}</span>
                    </Button>
                  ) : null}
                  <Button size="sm" variant="secondary" onClick={() => staffAction(m, 'recovery')}>
                    Open recovery<span className="sr-only"> for {m.handle}</span>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => staffAction(m, 'offboard')}>
                    Offboard<span className="sr-only"> {m.handle}</span>
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </DataCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DataCard
          title="Invite a staff member"
          description="Invitations are for new accounts only and expire after 72 hours."
        >
          <form noValidate onSubmit={invite} className="flex flex-col gap-4">
            <Field id="invite-email" label="Email" error={emailError}>
              {(control) => (
                <Input
                  {...control}
                  type="email"
                  value={email}
                  autoComplete="off"
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </Field>
            <Field id="invite-role" label="Role">
              {(control) => (
                <Select
                  {...control}
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as StaffRole)}
                >
                  {STAFF_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Button type="submit" className="w-fit">
              Create invitation
            </Button>
          </form>
        </DataCard>

        <DataCard
          title="Change a role"
          description="Grants and removing an administrator wait for a second administrator."
        >
          <div className="flex flex-col gap-4">
            <Field id="role-target" label="Staff member">
              {(control) => (
                <Select {...control} value={roleTarget} onChange={(e) => setRoleTarget(e.target.value)}>
                  <option value="">Choose a staff member</option>
                  {active.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.handle}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field id="role-role" label="Role">
              {(control) => (
                <Select {...control} value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
                  {STAFF_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => changeRole('grant')}>
                Request grant
              </Button>
              <Button variant="ghost" onClick={() => changeRole('revoke')}>
                Remove role
              </Button>
            </div>
          </div>
        </DataCard>
      </div>

      <DataCard title={`Invitations (${invitations.length})`}>
        {invitations.length === 0 ? (
          <p className="text-sm text-muted">No invitations.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {invitations.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 text-sm">
                  <p className="text-text">
                    <span className="identifier">{inv.id}</span> · {ROLE_LABEL[inv.role]} · {inv.emailMasked}
                  </p>
                  <p className="text-xs text-muted">
                    {INVITATION_STATE[inv.state]} · invited by {inv.invitedBy.handle}
                    {inv.approvedBy ? ` · approved by ${inv.approvedBy.handle}` : ''} · expires{' '}
                    {formatDateTimeUtc(inv.expiresAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {inv.state === 'pending_approval' ? (
                    <Button size="sm" variant="secondary" onClick={() => invitationAction(inv, 'approve')}>
                      Approve<span className="sr-only"> invitation {inv.id}</span>
                    </Button>
                  ) : null}
                  {inv.state === 'pending_approval' || inv.state === 'issued' ? (
                    <Button size="sm" variant="ghost" onClick={() => invitationAction(inv, 'revoke')}>
                      Revoke<span className="sr-only"> invitation {inv.id}</span>
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DataCard>

      <DataCard title={`Role change requests (${requests.length})`}>
        {requests.length === 0 ? (
          <p className="text-sm text-muted">No role change requests.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {requests.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="text-sm">
                  <p className="text-text">
                    {r.action === 'grant' ? 'Grant' : 'Remove'} {ROLE_LABEL[r.role]} · {r.target.handle}
                  </p>
                  <p className="text-xs text-muted">
                    {r.state === 'pending'
                      ? 'Waiting for a second administrator'
                      : r.state === 'approved'
                        ? 'Approved'
                        : 'Cancelled'}{' '}
                    · proposed by {r.proposedBy.handle}
                    {r.approvedBy ? ` · approved by ${r.approvedBy.handle}` : ''}
                  </p>
                </div>
                {r.state === 'pending' ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => approveRequest(r)}>
                      Approve<span className="sr-only"> request {r.id}</span>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void cancelRequest(r)}>
                      Cancel<span className="sr-only"> request {r.id}</span>
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </DataCard>

      <DataCard
        title={`Staff recovery (${recoveries.length})`}
        description="Two staff members (at least one an administrator) verify identity, a different administrator approves, then a 24-hour objection window runs. Moderators verify from Recovery verification."
      >
        {recoveries.length === 0 ? (
          <p className="text-sm text-muted">No recovery cases.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {recoveries.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                <p className="text-sm text-text">
                  <span className="identifier">{r.id}</span> · {r.subject.handle} · {RECOVERY_STATE[r.state]}
                </p>
                <p className="text-xs text-muted">
                  Opened by {r.openedBy.handle}
                  {r.verifications.map((v) => ` · verified by ${v.verifier.handle} (${v.method})`).join('')}
                  {r.approvedBy ? ` · approved by ${r.approvedBy.handle}` : ''}
                  {r.objectionWindowEndsAt
                    ? ` · objection window ends ${formatDateTimeUtc(r.objectionWindowEndsAt)}`
                    : ''}
                </p>
                {r.state === 'verifying' ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <Field id={`verify-${r.id}`} label="How did you verify identity?">
                      {(control) => (
                        <Input
                          {...control}
                          value={methods[r.id] ?? ''}
                          onChange={(e) => setMethods({ ...methods, [r.id]: e.target.value })}
                        />
                      )}
                    </Field>
                    <Button size="sm" variant="secondary" className="w-fit" onClick={() => void verify(r)}>
                      Record verification
                    </Button>
                  </div>
                ) : null}
                {r.state === 'awaiting_approval' ? (
                  <Button size="sm" variant="secondary" className="w-fit" onClick={() => approveRecovery(r)}>
                    Approve recovery
                  </Button>
                ) : null}
                {r.state === 'objection_window' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-fit"
                    onClick={() => void completeRecovery(r)}
                  >
                    Complete after the objection window
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </DataCard>
      <ProtectedAction request={request} onClose={close} verify={verifyAdminStepUp} />
    </div>
  );
}
