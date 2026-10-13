'use client';

import type { PasskeyResult } from '@blacklist/contracts';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import type { FormAlertState } from '@/components/auth/form-alert';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { StepUpDialog } from '@/components/security/step-up-dialog';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';

export interface ProtectedActionRequest {
  readonly title: string;
  readonly description: string;
  readonly consequences?: ReactNode;
  readonly confirmLabel?: string;
  readonly tone?: 'default' | 'danger';
  /** Ask for an internal reason (staff only, at least 10 characters). */
  readonly reasonLabel?: string;
  /** Step-up action and target (identity §10.7); omit for actions without a step-up. */
  readonly stepUp?: { readonly action: string; readonly targetId: string; readonly description: string };
  readonly parameters?: (reason: string) => readonly unknown[];
  readonly run: (reason: string) => Promise<void>;
}

/**
 * Holds the pending protected action. `close` clears only the request that finished, so
 * starting another action while a previous one is still completing never loses it.
 */
export function useProtectedAction() {
  const [request, setRequest] = useState<ProtectedActionRequest | null>(null);
  const close = useCallback(
    (finished: ProtectedActionRequest) => setRequest((current) => (current === finished ? null : current)),
    [],
  );
  return { request, start: setRequest, close };
}

interface ProtectedActionProps {
  readonly request: ProtectedActionRequest | null;
  readonly onClose: (request: ProtectedActionRequest) => void;
  readonly verify: (
    action: string,
    targetId: string,
    parameters?: readonly unknown[],
  ) => Promise<PasskeyResult>;
}

/**
 * Confirmation screen, then (when required) an action-bound security-key step-up, then
 * the action. Shared by the administrator console and staff finding actions so every
 * consequential action follows the same steps.
 */
export function ProtectedAction({ request, onClose, verify }: ProtectedActionProps) {
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [running, setRunning] = useState(false);
  // Set synchronously when moving on to the security key, so the confirmation closing does not cancel the action.
  const advancing = useRef(false);
  if (!request) return null;

  const finish = async () => {
    const current = request;
    advancing.current = true;
    setRunning(true);
    await current.run(reason.trim());
    setReason('');
    setRunning(false);
    advancing.current = false;
    onClose(current);
  };

  return (
    <>
      <ConfirmDialog
        open={!stepUpOpen && !running}
        onOpenChange={(open) => {
          if (!open && !advancing.current && !running) {
            setReason('');
            setReasonError(undefined);
            onClose(request);
          }
        }}
        title={request.title}
        description={request.description}
        tone={request.tone ?? 'default'}
        confirmLabel={request.stepUp ? 'Continue to security key' : (request.confirmLabel ?? 'Confirm')}
        pendingLabel="Working…"
        consequences={
          <div className="flex flex-col gap-3">
            {request.consequences}
            {request.reasonLabel ? (
              <Field id="protected-reason" label={request.reasonLabel} error={reasonError}>
                {(control) => (
                  <Textarea
                    {...control}
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                )}
              </Field>
            ) : null}
          </div>
        }
        onConfirm={async (): Promise<FormAlertState | null> => {
          if (request.reasonLabel && reason.trim().length < 10) {
            setReasonError('Write at least 10 characters.');
            return { kind: 'error', title: 'A reason is required' };
          }
          setReasonError(undefined);
          if (request.stepUp) {
            advancing.current = true;
            setStepUpOpen(true);
            return null;
          }
          await finish();
          return null;
        }}
      />
      {request.stepUp ? (
        <StepUpDialog
          open={stepUpOpen}
          // Closing the security-key step returns to the confirmation screen, which can be cancelled.
          onOpenChange={(open) => {
            if (!open) advancing.current = false;
            setStepUpOpen(open);
          }}
          actionDescription={request.stepUp.description}
          action={request.stepUp.action}
          targetId={request.stepUp.targetId}
          parameters={request.parameters?.(reason.trim()) ?? [request.stepUp.targetId]}
          verify={verify}
          onVerified={() => void finish()}
        />
      ) : null}
    </>
  );
}
