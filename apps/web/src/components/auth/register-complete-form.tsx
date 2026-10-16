'use client';

import { MEMBER_PASSWORD_MIN_CODE_POINTS, registerCompleteFormSchema } from '@blacklist/contracts';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Spinner } from '@/components/ui/spinner';
import { getAuthApi } from '@/lib/api/browser';
import { NEW_PASSWORD_HINT, passwordRejectionMessage } from '@/lib/auth/password-copy';
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

const FIELDS = ['handle', 'password', 'confirmPassword'] as const;
type Outcome =
  | { readonly kind: 'form' }
  | { readonly kind: 'success' }
  | { readonly kind: 'problem'; readonly status: 'invalid' | 'expired' | 'used' | 'superseded' };

export function RegisterCompleteForm() {
  const token = useFragmentToken();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'form' });

  if (token.kind === 'reading') return <Spinner label="Checking your link…" />;
  if (token.kind === 'missing')
    return <TokenProblem status="missing" retryHref="/register" retryLabel="Start again" />;
  if (token.kind === 'malformed')
    return <TokenProblem status="invalid" retryHref="/register" retryLabel="Start again" />;
  if (outcome.kind === 'problem')
    return <TokenProblem status={outcome.status} retryHref="/register" retryLabel="Request a new link" />;
  if (outcome.kind === 'success') {
    return (
      <FlowSuccess
        title="Account created"
        body="Your account is ready. Sign in to continue."
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
    const result = validateForm(registerCompleteFormSchema, readFields(form, FIELDS));
    if (!result.ok) {
      setErrors(result.errors);
      focusFirstError(form, result.errors, FIELDS);
      return;
    }
    setErrors({});
    setAlert({ kind: 'none' });
    setSubmitting(true);
    try {
      const res = await (await getAuthApi()).registerComplete(tokenValue, result.data);
      switch (res.kind) {
        case 'success':
          setOutcome({ kind: 'success' });
          break;
        case 'token_problem':
          setOutcome({ kind: 'problem', status: res.status });
          break;
        case 'password_rejected':
          setErrors({ password: passwordRejectionMessage(res.reason) });
          focusFirstError(form, { password: 'x' }, FIELDS);
          break;
        case 'handle_unavailable':
          setErrors({ handle: 'This handle is not available. Try another.' });
          focusFirstError(form, { handle: 'x' }, FIELDS);
          break;
        case 'rate_limited':
          setAlert(rateLimitedAlert(res.retryAfterSeconds));
          break;
        case 'temporarily_unavailable':
          setAlert(unavailableAlert());
          break;
        case 'unexpected_error':
          setAlert(unexpectedAlert(res.requestId));
          break;
      }
    } catch {
      setAlert(unexpectedAlert('client-error'));
    }
    setSubmitting(false);
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormAlert state={alert} />
      <Field
        id="reg-handle"
        label="Handle"
        hint="Visible to you and Blacklist staff only. Lowercase letters, numbers and underscores. Your email is never shown."
        error={errors['handle']}
      >
        {(control) => (
          <Input
            {...control}
            name="handle"
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={30}
            required
          />
        )}
      </Field>
      <Field id="reg-password" label="Password" hint={NEW_PASSWORD_HINT} error={errors['password']}>
        {(control) => (
          <PasswordInput
            {...control}
            name="password"
            autoComplete="new-password"
            showRequirement
            minimum={MEMBER_PASSWORD_MIN_CODE_POINTS}
            required
          />
        )}
      </Field>
      <Field id="reg-confirm" label="Confirm password" error={errors['confirmPassword']}>
        {(control) => (
          <PasswordInput {...control} name="confirmPassword" autoComplete="new-password" required />
        )}
      </Field>
      <Button
        type="submit"
        size="lg"
        loading={submitting}
        loadingLabel="Creating account…"
        className="mt-2 w-full"
      >
        Create account
      </Button>
    </form>
  );
}
