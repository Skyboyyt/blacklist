'use client';

import { useState, type ReactNode } from 'react';
import { FormAlert, type FormAlertState } from '@/components/auth/form-alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';

interface ConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
  /** What will happen, in plain words. */
  readonly consequences?: ReactNode;
  readonly confirmLabel: string;
  readonly pendingLabel: string;
  readonly tone?: 'default' | 'danger';
  /** Resolves to null on success (the dialog closes) or to an alert to show. */
  readonly onConfirm: () => Promise<FormAlertState | null>;
}

/**
 * Confirmation for security-sensitive actions: clear action, consequences, cancel,
 * confirm, pending and error states. No typed confirmation phrases: the risk of the
 * actions here does not justify them. Focus returns to the opener on close (Radix).
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const {
    open,
    onOpenChange,
    title,
    description,
    consequences,
    confirmLabel,
    pendingLabel,
    tone = 'default',
    onConfirm,
  } = props;
  const [pending, setPending] = useState(false);
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });

  async function confirm() {
    if (pending) return;
    setPending(true);
    setAlert({ kind: 'none' });
    const result = await onConfirm();
    setPending(false);
    if (result) setAlert(result);
    else onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return; // do not close mid-request
        if (!next) setAlert({ kind: 'none' });
        onOpenChange(next);
      }}
    >
      <DialogContent title={title} description={description}>
        <FormAlert state={alert} />
        {consequences ? <div className="mb-4 text-sm text-muted">{consequences}</div> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={confirm}
            loading={pending}
            loadingLabel={pendingLabel}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
