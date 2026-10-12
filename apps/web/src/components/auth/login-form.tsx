'use client';

import { loginRequestSchema } from '@blacklist/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { SecurityBanner } from '@/components/security/security-banner';
import type { SessionEndReason } from '@/components/security/session-expired-panel';
import { getAuthApi } from '@/lib/api/browser';
import { focusFirstError, readFields, validateForm, type FieldErrors } from '@/lib/forms/validate';
import {
  FormAlert,
  rateLimitedAlert,
  unavailableAlert,
  unexpectedAlert,
  type FormAlertState,
} from './form-alert';

const FIELDS = ['email', 'password'] as const;

interface LoginFormProps {
  /** Already validated with safeNextPath on the server. */
  readonly next: string;
  /** Why the user is signing in again, if they were signed out (shown as a calm banner). */
  readonly endedReason?: SessionEndReason | undefined;
}

const ENDED_COPY: Record<SessionEndReason, { title: string; body: string }> = {
  session_expired: { title: 'Your session has ended', body: 'Sign in again to continue where you left off.' },
  staff_verification_expired: {
    title: 'Your staff verification has ended',
    body: 'Sign in again, then verify with your security key or passkey.',
  },
};

export function LoginForm({ next, endedReason }: LoginFormProps) {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (submitting) return;

    const result = validateForm(loginRequestSchema, readFields(form, FIELDS));
    if (!result.ok) {
      setErrors(result.errors);
      setAlert({ kind: 'none' });
      focusFirstError(form, result.errors, FIELDS);
      return;
    }
    setErrors({});
    setAlert({ kind: 'none' });
    setSubmitting(true);
    try {
      const outcome = await (await getAuthApi()).login(result.data, next);
      switch (outcome.kind) {
        case 'signed_in':
          router.push(outcome.redirectTo);
          return;
        case 'staff_verification_required':
          router.push('/staff/verify');
          return;
        case 'invalid_credentials':
          // Generic on purpose: never reveal whether the email has an account.
          setAlert({ kind: 'error', title: 'Email or password is incorrect' });
          clearPassword(form);
          break;
        case 'rate_limited':
          setAlert(rateLimitedAlert(outcome.retryAfterSeconds));
          clearPassword(form);
          break;
        case 'temporarily_unavailable':
          setAlert(unavailableAlert());
          break;
        case 'unexpected_error':
          setAlert(unexpectedAlert(outcome.requestId));
          break;
      }
    } catch {
      setAlert(unexpectedAlert('client-error'));
    }
    setSubmitting(false);
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      {endedReason && alert.kind === 'none' ? (
        <SecurityBanner kind="session_expired" title={ENDED_COPY[endedReason].title}>
          {ENDED_COPY[endedReason].body}
        </SecurityBanner>
      ) : null}
      <FormAlert state={alert} />
      <Field id="login-email" label="Email" error={errors['email']}>
        {(control) => (
          <Input
            {...control}
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            spellCheck={false}
            required
          />
        )}
      </Field>
      <Field
        id="login-password"
        label="Password"
        error={errors['password']}
        labelAside={
          <Link href="/forgot-password" className="text-sm font-medium text-accent hover:underline">
            Forgot password?
          </Link>
        }
      >
        {(control) => <PasswordInput {...control} name="password" autoComplete="current-password" required />}
      </Field>
      <Button type="submit" size="lg" loading={submitting} loadingLabel="Signing in…" className="mt-2 w-full">
        Sign in
      </Button>
      <p className="text-center text-sm text-muted">
        New to Blacklist?{' '}
        <Link href="/register" className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}

function clearPassword(form: HTMLFormElement) {
  const field = form.elements.namedItem('password');
  if (field instanceof HTMLInputElement) field.value = '';
}
