'use client';

import { passwordChangeFormSchema } from '@blacklist/contracts';
import { useState, type FormEvent } from 'react';
import {
  accountErrorAlert,
  FormAlert,
  unexpectedAlert,
  type FormAlertState,
} from '@/components/auth/form-alert';
import { FlowSuccess } from '@/components/auth/token-problem';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/password-input';
import { getAccountApi } from '@/lib/api/browser';
import { NEW_PASSWORD_HINT } from '@/lib/auth/password-copy';
import { focusFirstError, readFields, validateForm, type FieldErrors } from '@/lib/forms/validate';
import { SessionExpiredPanel } from './session-expired-panel';

const FIELDS = ['currentPassword', 'newPassword', 'confirmPassword'] as const;

/**
 * Signed-in password change (identity §6.4). Entering the current password is the
 * proof; the future API also signs out every other session. No cooling period follows.
 */
export function PasswordChangeForm() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<'form' | 'success' | 'session_expired'>('form');

  if (done === 'success') {
    return (
      <FlowSuccess
        title="Password changed"
        body="Your new password is set. Your other sessions are signed out; this one stays signed in."
        href="/settings/security"
        cta="Back to security"
      />
    );
  }
  if (done === 'session_expired') return <SessionExpiredPanel />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const result = validateForm(passwordChangeFormSchema, readFields(form, FIELDS));
    if (!result.ok) {
      setErrors(result.errors);
      focusFirstError(form, result.errors, FIELDS);
      return;
    }
    setErrors({});
    setAlert({ kind: 'none' });
    setPending(true);
    try {
      const res = await (await getAccountApi()).changePassword(result.data);
      if (res.kind === 'ok') setDone('success');
      else if (res.code === 'session_expired') setDone('session_expired');
      else if (res.code === 'current_password_incorrect') {
        setErrors({ currentPassword: 'Your current password is incorrect.' });
        const field = form.elements.namedItem('currentPassword');
        if (field instanceof HTMLInputElement) {
          field.value = '';
          field.focus();
        }
      } else setAlert(accountErrorAlert(res));
    } catch {
      setAlert(unexpectedAlert('client-error'));
    }
    setPending(false);
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex max-w-md flex-col gap-4">
      <FormAlert state={alert} />
      <Field id="pc-current" label="Current password" error={errors['currentPassword']}>
        {(control) => (
          <PasswordInput {...control} name="currentPassword" autoComplete="current-password" required />
        )}
      </Field>
      <Field id="pc-new" label="New password" hint={NEW_PASSWORD_HINT} error={errors['newPassword']}>
        {(control) => (
          <PasswordInput
            {...control}
            name="newPassword"
            autoComplete="new-password"
            showRequirement
            required
          />
        )}
      </Field>
      <Field id="pc-confirm" label="Confirm new password" error={errors['confirmPassword']}>
        {(control) => (
          <PasswordInput {...control} name="confirmPassword" autoComplete="new-password" required />
        )}
      </Field>
      <p className="text-xs text-muted">
        Changing your password signs out your other sessions. This session stays signed in.
      </p>
      <Button
        type="submit"
        size="lg"
        loading={pending}
        loadingLabel="Changing password…"
        className="sm:w-fit"
      >
        Change password
      </Button>
    </form>
  );
}
