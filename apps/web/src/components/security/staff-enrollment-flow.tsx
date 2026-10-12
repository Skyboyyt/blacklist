'use client';

import {
  ENROLLMENT_CODE_LENGTH,
  enrollmentStartSchema,
  resetPasswordFormSchema,
  type EnrollmentStartResult,
} from '@blacklist/contracts';
import { useCallback, useState, type FormEvent } from 'react';
import {
  FormAlert,
  rateLimitedAlert,
  unavailableAlert,
  unexpectedAlert,
  type FormAlertState,
} from '@/components/auth/form-alert';
import { FlowSuccess, TokenProblem } from '@/components/auth/token-problem';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Spinner } from '@/components/ui/spinner';
import { getStaffSecurityApi } from '@/lib/api/browser';
import { NEW_PASSWORD_HINT } from '@/lib/auth/password-copy';
import { useFragmentToken } from '@/lib/auth/use-fragment-token';
import { focusFirstError, readFields, validateForm, type FieldErrors } from '@/lib/forms/validate';
import { usePasskeyCeremony } from '@/lib/security/use-passkey-ceremony';
import { EnrollmentSteps } from './enrollment-steps';
import { PasskeyPrompt } from './passkey-prompt';

type Step = 'code' | 'password' | 'auth1' | 'auth2' | 'activating' | 'complete';
type InvitationProblem = Extract<EnrollmentStartResult, { kind: 'invitation_problem' }>['status'];

const STEP_INDEX: Record<Step, number> = {
  code: 0,
  password: 1,
  auth1: 2,
  auth2: 3,
  activating: 4,
  complete: 4,
};

/**
 * Staff enrollment (identity §10.4–§10.5): the emailed link (fragment token) AND the
 * one-time enrollment code from a separate channel, then a password and two
 * authenticators, then one atomic activation. Abandoning it leaves no account.
 * The password is validated here and handed to the API in the future; this preview
 * discards it immediately and never stores it.
 */
export function StaffEnrollmentFlow() {
  const token = useFragmentToken();
  const [step, setStep] = useState<Step>('code');
  const [problem, setProblem] = useState<InvitationProblem | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const [pending, setPending] = useState(false);

  const register1 = useCallback(async () => (await getStaffSecurityApi()).registerAuthenticator(1), []);
  const register2 = useCallback(async () => (await getStaffSecurityApi()).registerAuthenticator(2), []);
  const first = usePasskeyCeremony(register1);
  const second = usePasskeyCeremony(register2);

  if (token.kind === 'reading') return <Spinner label="Checking your invitation…" />;
  if (token.kind !== 'present') {
    return (
      <TokenProblem
        status={token.kind === 'missing' ? 'missing' : 'invalid'}
        retryHref="/"
        retryLabel="Back to Blacklist"
      />
    );
  }
  if (problem) {
    // A revoked invitation is explained like an invalid link; the administrator can say more.
    return (
      <TokenProblem
        status={problem === 'revoked' ? 'invalid' : problem}
        retryHref="/"
        retryLabel="Back to Blacklist"
      />
    );
  }
  if (step === 'complete') {
    return (
      <FlowSuccess
        title="Your staff account is ready"
        body="Sign in with your password, then verify with one of your two registered authenticators."
        href="/login"
        cta="Go to sign in"
      />
    );
  }
  const tokenValue = token.token;

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const parsed = validateForm(enrollmentStartSchema, {
      token: tokenValue,
      ...readFields(form, ['code'] as const),
    });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      focusFirstError(form, parsed.errors, ['code']);
      return;
    }
    setErrors({});
    setAlert({ kind: 'none' });
    setPending(true);
    try {
      const res = await (await getStaffSecurityApi()).startEnrollment(parsed.data);
      if (res.kind === 'ok') setStep('password');
      else if (res.kind === 'invitation_problem') setProblem(res.status);
      else if (res.kind === 'code_incorrect') {
        setErrors({
          code:
            res.attemptsRemaining > 0
              ? `That code is incorrect. ${res.attemptsRemaining} ${res.attemptsRemaining === 1 ? 'attempt' : 'attempts'} left.`
              : 'That code is incorrect and no attempts are left. Ask your administrator for a new invitation.',
        });
      } else if (res.kind === 'rate_limited') setAlert(rateLimitedAlert(res.retryAfterSeconds));
      else setAlert(unavailableAlert());
    } catch {
      setAlert(unexpectedAlert('client-error'));
    }
    setPending(false);
  }

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = validateForm(
      resetPasswordFormSchema,
      readFields(form, ['password', 'confirmPassword'] as const),
    );
    if (!parsed.ok) {
      setErrors(parsed.errors);
      focusFirstError(form, parsed.errors, ['password', 'confirmPassword']);
      return;
    }
    form.reset(); // preview: the password is not kept anywhere
    setErrors({});
    setStep('auth1');
  }

  async function activate() {
    setStep('activating');
    try {
      const res = await (await getStaffSecurityApi()).completeEnrollment();
      if (res.kind === 'ok') {
        setStep('complete');
        return;
      }
    } catch {
      // fall through
    }
    setAlert(unavailableAlert());
    setStep('auth2');
  }

  return (
    <div>
      <EnrollmentSteps current={STEP_INDEX[step]} />
      <FormAlert state={alert} />

      {step === 'code' ? (
        <form noValidate onSubmit={submitCode} className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Enter the {ENROLLMENT_CODE_LENGTH}-character enrollment code your administrator gave you through a
            separate channel. It is not in the invitation email.
          </p>
          <Field id="enroll-code" label="Enrollment code" error={errors['code']}>
            {(control) => (
              <Input
                {...control}
                name="code"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={14}
                className="identifier tracking-widest uppercase"
                required
              />
            )}
          </Field>
          <Button type="submit" size="lg" loading={pending} loadingLabel="Checking…" className="w-full">
            Continue
          </Button>
        </form>
      ) : null}

      {step === 'password' ? (
        <form noValidate onSubmit={submitPassword} className="flex flex-col gap-4">
          <Field id="enroll-password" label="Password" hint={NEW_PASSWORD_HINT} error={errors['password']}>
            {(control) => (
              <PasswordInput
                {...control}
                name="password"
                autoComplete="new-password"
                showRequirement
                required
              />
            )}
          </Field>
          <Field id="enroll-confirm" label="Confirm password" error={errors['confirmPassword']}>
            {(control) => (
              <PasswordInput {...control} name="confirmPassword" autoComplete="new-password" required />
            )}
          </Field>
          <Button type="submit" size="lg" className="w-full">
            Continue
          </Button>
        </form>
      ) : null}

      {step === 'auth1' ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Register your first security key or passkey. Your browser will ask you to confirm with your
            device, PIN or fingerprint.
          </p>
          <PasskeyPrompt
            state={first.state}
            onStart={async () => {
              if ((await first.start()) === 'verified') setStep('auth2');
            }}
            startLabel="Register first authenticator"
            successText="First authenticator registered."
          />
        </div>
      ) : null}

      {step === 'auth2' || step === 'activating' ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Register a second, separate authenticator. Two registrations do not guarantee two independent
            devices: synced passkeys can be lost together. Use a different kind if you can, such as a hardware
            security key plus a passkey.
          </p>
          <PasskeyPrompt
            state={second.state}
            onStart={async () => {
              if ((await second.start()) === 'verified') await activate();
            }}
            startLabel="Register second authenticator"
            successText="Second authenticator registered."
          />
          {step === 'activating' ? (
            <p role="status" className="text-sm text-muted">
              Activating your staff account…
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
