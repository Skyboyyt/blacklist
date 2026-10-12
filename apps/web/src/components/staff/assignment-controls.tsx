'use client';

import type { CaseDetail, StaffRole } from '@blacklist/contracts';
import { useState } from 'react';
import type { FormAlertState } from '@/components/auth/form-alert';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { Button } from '@/components/ui/button';
import { hasPermission } from '@/lib/staff/permissions';

interface AssignmentControlsProps {
  readonly detail: CaseDetail;
  readonly staffRole: StaffRole;
  readonly myHandle: string;
  readonly onAssign: (to: 'me' | 'nobody', takeOver: boolean) => Promise<FormAlertState | null>;
}

/** Assignment state and actions. Taking over another reviewer's case needs explicit confirmation. */
export function AssignmentControls({ detail, staffRole, myHandle, onAssign }: AssignmentControlsProps) {
  const [takeOverOpen, setTakeOverOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const assignee = detail.assignedTo;
  const mine = assignee?.handle === myHandle;
  const canAssign = hasPermission(staffRole, 'moderation:case:assign');

  async function run(to: 'me' | 'nobody') {
    if (pending) return;
    setPending(true);
    await onAssign(to, false);
    setPending(false);
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <p className="text-sm text-text">
        {assignee ? `Assigned to ${mine ? 'you' : assignee.handle}` : 'Unassigned'}
      </p>
      {canAssign ? (
        <div className="flex flex-wrap gap-2">
          {!assignee ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => run('me')}
              loading={pending}
              loadingLabel="Assigning…"
            >
              Assign to me
            </Button>
          ) : null}
          {assignee && !mine ? (
            <Button size="sm" variant="secondary" onClick={() => setTakeOverOpen(true)}>
              Take over case
            </Button>
          ) : null}
          {assignee && (mine || staffRole === 'admin') ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => run('nobody')}
              loading={pending}
              loadingLabel="Unassigning…"
            >
              Unassign
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted">Your role reviews appeals assigned to you by staff.</p>
      )}
      <ConfirmDialog
        open={takeOverOpen}
        onOpenChange={setTakeOverOpen}
        title="Take over this case?"
        description={`It is assigned to ${assignee?.handle ?? 'another reviewer'}. They will no longer be able to decide it.`}
        confirmLabel="Take over"
        pendingLabel="Assigning…"
        onConfirm={() => onAssign('me', true)}
      />
    </div>
  );
}
