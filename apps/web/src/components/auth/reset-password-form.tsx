'use client';

import { resetPasswordFormSchema } from '@blacklist/contracts';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/password-input';
import { Spinner } from '@/components/ui/spinner';
import { getAuthApi } from '@/lib/api/browser';
import { NEW_PASSWORD_HINT } from '@/lib/auth/password-copy';
import { useFragmentToken } from '@/lib/auth/use-fragment-token';
import { focusFirstError, readFields, validateForm, type FieldErrors } from '@/lib/forms/validate';
import {
  FormAlert,
  rateLimitedAlert,
  unavailableAlert,
  unexpectedAlert,
  type FormAlertState,
} from './form-alert';
import { FlowSuccess, TokenProblem } from './token-problem';

const FIELDS = ['password', 'confirmPassword'] as const;

type Outcome =
  | { readonly kind: 'form' }
  | { readonly kind: 'success' }
  | { readonly kind: 'problem'; readonly status: 'invalid' | 'expired' | 'used' | 'superseded' };

export function ResetPasswordForm() {
  const token = useFragmentToken();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'form' });

  if (token.kind === 'reading') return <Spinner label="Checking your link…" />;
  if (token.kind === 'missing')
    return <TokenProblem status="missing" retryHref="/forgot-password" retryLabel="Request a new link" />;
  if (token.kind === 'malformed')
    return <TokenProblem status="invalid" retryHref="/forgot-password" retryLabel="Request a new link" />;
  if (outcome.kind === 'problem')
    return (
      <TokenProblem status={outcome.status} retryHref="/forgot-password" retryLabel="Request a new link" />
    );
  if (outcome.kind === 'success') {
    return (
      <FlowSuccess
        title="Password changed"
        body="Your new password is set. For your security, every signed-in session is ended and changing your email is paused for 72 hours. Sign in with your new password."
        href="/login"
        cta="Sign in"
      />
    );
  }
  const tokenValue = token.token;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = event.currentTarget;
    const result = validateForm(resetPasswordFormSchema, readFields(form, FIELDS));
    if (!result.ok) {
      setErrors(result.errors);
      focusFirstError(form, result.errors, FIELDS);
      return;
    }
    setErrors({});
    setAlert({ kind: 'none' });
    setSubmitting(true);
    try {
      const res = await (await getAuthApi()).resetPassword(tokenValue, result.data);
      if (res.kind === 'success') setOutcome({ kind: 'success' });
      else if (res.kind === 'token_problem') setOutcome({ kind: 'problem', status: res.status });
      else if (res.kind === 'rate_limited') setAlert(rateLimitedAlert(res.retryAfterSeconds));
      else if (res.kind === 'temporarily_unavailable') setAlert(unavailableAlert());
      else if (res.kind === 'unexpected_error') setAlert(unexpectedAlert(res.requestId));
      else setAlert(unexpectedAlert('unexpected-outcome'));
    } catch {
      setAlert(unexpectedAlert('client-error'));
    }
    setSubmitting(false);
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormAlert state={alert} />
      <Field id="reset-password" label="New password" hint={NEW_PASSWORD_HINT} error={errors['password']}>
        {(control) => (
          <PasswordInput {...control} name="password" autoComplete="new-password" showRequirement required />
        )}
      </Field>
      <Field id="reset-confirm" label="Confirm new password" error={errors['confirmPassword']}>
        {(control) => (
          <PasswordInput {...control} name="confirmPassword" autoComplete="new-password" required />
        )}
      </Field>
      <Button type="submit" size="lg" loading={submitting} loadingLabel="Saving…" className="mt-2 w-full">
        Set new password
      </Button>
    </form>
  );
}
