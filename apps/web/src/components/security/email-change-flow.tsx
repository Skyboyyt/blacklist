'use client';

import { emailChangeRequestSchema, type AccountSecurity } from '@blacklist/contracts';
import { useState, type FormEvent } from 'react';
import {
  accountErrorAlert,
  FormAlert,
  unexpectedAlert,
  type FormAlertState,
} from '@/components/auth/form-alert';
import { Button, ButtonLink } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { getAccountApi } from '@/lib/api/browser';
import { focusFirstError, readFields, validateForm, type FieldErrors } from '@/lib/forms/validate';
import { CoolingPeriodNotice } from './cooling-period-notice';
import { ReauthDialog } from './reauth-dialog';
import { SecurityBanner } from './security-banner';
import { SessionExpiredPanel } from './session-expired-panel';

type Step =
  | { readonly kind: 'enter' }
  | { readonly kind: 'pending'; readonly newEmail: string }
  | { readonly kind: 'session_expired' };

/**
 * Email change (identity §7): fresh re-authentication, no active cooling period,
 * then a confirmation link to the NEW address (1 hour). The answer is the same
 * whether or not the new address already has an account; the address changes
 * only when the link is confirmed, and the old address is notified then.
 */
export function EmailChangeFlow({ security }: { readonly security: AccountSecurity }) {
  const [step, setStep] = useState<Step>({ kind: 'enter' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const [pending, setPending] = useState(false);
  const [reauthFor, setReauthFor] = useState<string | null>(null);

  if (security.cooling) return <CoolingPeriodNotice cooling={security.cooling} />;
  if (step.kind === 'session_expired') return <SessionExpiredPanel />;

  async function request(newEmail: string) {
    setPending(true);
    setAlert({ kind: 'none' });
    try {
      const res = await (await getAccountApi()).requestEmailChange({ newEmail });
      if (res.kind === 'ok') setStep({ kind: 'pending', newEmail });
      else if (res.code === 'reauth_required') setReauthFor(newEmail);
      else if (res.code === 'session_expired') setStep({ kind: 'session_expired' });
      else setAlert(accountErrorAlert(res));
    } catch {
      setAlert(unexpectedAlert('client-error'));
    }
    setPending(false);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const result = validateForm(emailChangeRequestSchema, readFields(form, ['newEmail'] as const));
    if (!result.ok) {
      setErrors(result.errors);
      focusFirstError(form, result.errors, ['newEmail']);
      return;
    }
    if (result.data.newEmail === security.email) {
      setErrors({ newEmail: 'This is already your email address.' });
      return;
    }
    setErrors({});
    void request(result.data.newEmail);
  }

  if (step.kind === 'pending') {
    return (
      <div className="flex max-w-lg flex-col gap-4">
        <SecurityBanner kind="change_pending" title="Check your new inbox">
          If <strong className="text-text">{step.newEmail}</strong> can be used for a Blacklist account, we
          sent it a confirmation link. The link works for 1 hour. Your current address stays active until you
          confirm, and we’ll let it know after the change.
        </SecurityBanner>
        <p className="text-sm text-muted">
          Didn’t get it? Check spam, or request again in a few minutes. Only the newest link works.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setStep({ kind: 'enter' })}>
            Use a different address
          </Button>
          <ButtonLink href="/settings/security" variant="ghost">
            Cancel and go back
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <>
      <form noValidate onSubmit={onSubmit} className="flex max-w-md flex-col gap-4">
        <FormAlert state={alert} />
        <p className="text-sm text-muted">
          Current address: <span className="font-medium text-text">{security.email}</span>
        </p>
        <Field
          id="ec-new"
          label="New email address"
          error={errors['newEmail']}
          hint="We’ll send a confirmation link to the new address."
        >
          {(control) => (
            <Input
              {...control}
              name="newEmail"
              type="email"
              autoComplete="email"
              inputMode="email"
              spellCheck={false}
              required
            />
          )}
        </Field>
        <Button type="submit" size="lg" loading={pending} loadingLabel="Sending…" className="sm:w-fit">
          Send confirmation link
        </Button>
      </form>
      <ReauthDialog
        open={reauthFor !== null}
        onOpenChange={(open) => {
          if (!open) setReauthFor(null);
        }}
        purpose="change your email address"
        onConfirmed={() => {
          const email = reauthFor;
          setReauthFor(null);
          if (email) void request(email);
        }}
      />
    </>
  );
}
