'use client';

import { useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { getStaffSecurityApi } from '@/lib/api/browser';
import { usePasskeyCeremony } from '@/lib/security/use-passkey-ceremony';
import { PasskeyPrompt } from './passkey-prompt';

interface StepUpDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Plain description of the action, e.g. "remove the authenticator “Hardware security key”". */
  readonly actionDescription: string;
  /** Machine action name and target the future API binds the challenge to (identity §10.7). */
  readonly action: string;
  readonly targetId: string;
  readonly onVerified: () => void;
}

/**
 * "Fresh staff security-key verification required" for dangerous staff actions.
 * Each confirmation is bound by the API to this one action and target, single use,
 * within 5 minutes; a verification for one action never authorizes another.
 */
export function StepUpDialog({
  open,
  onOpenChange,
  actionDescription,
  action,
  targetId,
  onVerified,
}: StepUpDialogProps) {
  const run = useCallback(
    async () => (await getStaffSecurityApi()).verifyPasskey({ kind: 'step_up', action, targetId }),
    [action, targetId],
  );
  const { state, start, reset } = usePasskeyCeremony(run);

  async function verify() {
    const result = await start();
    if (result === 'verified') {
      onOpenChange(false);
      reset();
      onVerified();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (state.status === 'waiting') return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent
        title="Verify with your security key"
        description={`Confirm that you want to ${actionDescription}. This verification applies to this action only.`}
      >
        <PasskeyPrompt
          state={state}
          onStart={verify}
          startLabel="Verify and continue"
          successText="Verified."
        />
      </DialogContent>
    </Dialog>
  );
}
