'use client';

import { reauthRequestSchema } from '@blacklist/contracts';
import { useState, type FormEvent } from 'react';
import {
  accountErrorAlert,
  FormAlert,
  unexpectedAlert,
  type FormAlertState,
} from '@/components/auth/form-alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/password-input';
import { getAccountApi } from '@/lib/api/browser';
import { readFields, validateForm, type FieldErrors } from '@/lib/forms/validate';

interface ReauthDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** What the user is about to do, e.g. "change your email address". */
  readonly purpose: string;
  /** Called after the API confirms re-authentication (valid for 10 minutes). */
  readonly onConfirmed: () => void;
}

/**
 * Member re-authentication for sensitive actions (identity §9). The browser does not
 * verify the password: it sends it once and acts on the API's answer. The password
 * is read from the form on submit and never kept in state.
 */
export function ReauthDialog({ open, onOpenChange, purpose, onConfirmed }: ReauthDialogProps) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const result = validateForm(reauthRequestSchema, readFields(form, ['password'] as const));
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setAlert({ kind: 'none' });
    setPending(true);
    try {
      const res = await (await getAccountApi()).reauthenticate(result.data);
      const field = form.elements.namedItem('password');
      if (field instanceof HTMLInputElement) field.value = '';
      if (res.kind === 'ok') {
        onOpenChange(false);
        onConfirmed();
      } else {
        setAlert(accountErrorAlert(res));
      }
    } catch {
      setAlert(unexpectedAlert('client-error'));
    }
    setPending(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) {
          setAlert({ kind: 'none' });
          setErrors({});
        }
        onOpenChange(next);
      }}
    >
      <DialogContent
        title="Confirm it’s you"
        description={`For your security, enter your password to ${purpose}.`}
      >
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormAlert state={alert} />
          <Field id="reauth-password" label="Password" error={errors['password']}>
            {(control) => (
              <PasswordInput {...control} name="password" autoComplete="current-password" required />
            )}
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="secondary" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending} loadingLabel="Checking…">
              Continue
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
