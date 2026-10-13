'use client';

import {
  resetPasswordFormSchema,
  type ResetPasswordForm as ResetPasswordFields,
  type ResetPasswordOutcome,
} from '@blacklist/contracts';
import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { PasskeyPrompt } from '@/components/security/passkey-prompt';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/password-input';
import { Spinner } from '@/components/ui/spinner';
import { getAuthApi } from '@/lib/api/browser';
import { NEW_PASSWORD_HINT, passwordRejectionMessage } from '@/lib/auth/password-copy';
import { useFragmentToken } from '@/lib/auth/use-fragment-token';
import { focusFirstError, readFields, validateForm, type FieldErrors } from '@/lib/forms/validate';
import { webAuthnSupported, type PasskeyCeremonyState } from '@/lib/security/use-passkey-ceremony';
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
  | { readonly kind: 'passkey' }
  | { readonly kind: 'success' }
  | { readonly kind: 'problem'; readonly status: 'invalid' | 'expired' | 'used' | 'superseded' };

/**
 * Reset redemption (identity §6.3). Staff accounts add a WebAuthn step bound to the
 * reset token before anything changes. Between the two submissions the new password
 * is held only in component memory, never in browser storage, and dropped on finish.
 */
export function ResetPasswordForm() {
  const token = useFragmentToken();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'form' });
  const [passkey, setPasskey] = useState<PasskeyCeremonyState>({ status: 'idle' });
  const pendingForm = useRef<ResetPasswordFields | null>(null);
  const passkeyInFlight = useRef(false);

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

  /** Applies an outcome that is not specific to the passkey step. */
  function settle(res: ResetPasswordOutcome) {
    if (res.kind === 'success' || res.kind === 'token_problem') pendingForm.current = null;
    if (res.kind === 'success') setOutcome({ kind: 'success' });
    else if (res.kind === 'token_problem') setOutcome({ kind: 'problem', status: res.status });
    else if (res.kind === 'passkey_required') {
      setPasskey({ status: 'idle' });
      setOutcome({ kind: 'passkey' });
    } else if (res.kind === 'passkey_not_verified') setPasskey({ status: res.result });
    else if (res.kind === 'password_rejected') {
      pendingForm.current = null;
      setOutcome({ kind: 'form' });
      setErrors({ password: passwordRejectionMessage(res.reason) });
    } else if (res.kind === 'rate_limited') setAlert(rateLimitedAlert(res.retryAfterSeconds));
    else if (res.kind === 'temporarily_unavailable') setAlert(unavailableAlert());
    else setAlert(unexpectedAlert(res.requestId));
  }

  async function verifyWithPasskey() {
    const form = pendingForm.current;
    if (passkeyInFlight.current || !form) return; // one ceremony at a time
    setAlert({ kind: 'none' });
    if (!webAuthnSupported()) {
      setPasskey({ status: 'unsupported' });
      return;
    }
    passkeyInFlight.current = true;
    setPasskey({ status: 'waiting' });
    try {
      const res = await (await getAuthApi()).resetPassword(tokenValue, form, { withPasskey: true });
      // Asked again for a passkey after one was supplied: treat as a failed ceremony.
      if (res.kind === 'passkey_required') setPasskey({ status: 'failed' });
      else {
        if (res.kind !== 'passkey_not_verified') setPasskey({ status: 'idle' });
        settle(res);
      }
    } catch {
      setPasskey({ status: 'idle' });
      setAlert(unexpectedAlert('client-error'));
    } finally {
      passkeyInFlight.current = false;
    }
  }

  if (outcome.kind === 'passkey') {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert state={alert} />
        <p className="text-sm text-muted">
          This is a staff account. To finish the reset, verify with one of your registered security keys or
          passkeys. Nothing changes until verification succeeds.
        </p>
        <PasskeyPrompt
          state={passkey}
          onStart={verifyWithPasskey}
          startLabel="Verify and set new password"
          successText="Verified."
        />
        <p className="text-xs text-muted">
          Lost all your authenticators?{' '}
          <Link href="/staff/recovery" className="font-medium text-accent hover:underline">
            How staff recovery works
          </Link>
        </p>
      </div>
    );
  }

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
      pendingForm.current = res.kind === 'passkey_required' ? result.data : null;
      if (res.kind === 'passkey_not_verified') setAlert(unexpectedAlert('unexpected-outcome'));
      else settle(res);
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
