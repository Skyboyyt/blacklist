'use client';

import { emailOnlyRequestSchema, type EmailAcceptedOutcome } from '@blacklist/contracts';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { focusFirstError, readFields, validateForm, type FieldErrors } from '@/lib/forms/validate';
import {
  FormAlert,
  rateLimitedAlert,
  unavailableAlert,
  unexpectedAlert,
  type FormAlertState,
} from './form-alert';

const schema = emailOnlyRequestSchema;
const FIELDS = ['email'] as const;

interface EmailRequestFormProps {
  readonly idPrefix: string;
  readonly submitLabel: string;
  readonly submittingLabel: string;
  readonly send: (email: string) => Promise<EmailAcceptedOutcome>;
  /** Shown after the request is accepted. Must not reveal whether an account exists. */
  readonly sentTitle: string;
  readonly sentBody: ReactNode;
  readonly footer?: ReactNode;
}

/** Email-only form used by registration (email-first) and password recovery. */
export function EmailRequestForm(props: EmailRequestFormProps) {
  const { idPrefix, submitLabel, submittingLabel, send, sentTitle, sentBody, footer } = props;
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = event.currentTarget;
    const result = validateForm(schema, readFields(form, FIELDS));
    if (!result.ok) {
      setErrors(result.errors);
      focusFirstError(form, result.errors, FIELDS);
      return;
    }
    setErrors({});
    setAlert({ kind: 'none' });
    setSubmitting(true);
    try {
      const outcome = await send(result.data.email);
      if (outcome.kind === 'accepted') setSent(true);
      else if (outcome.kind === 'rate_limited') setAlert(rateLimitedAlert(outcome.retryAfterSeconds));
      else if (outcome.kind === 'temporarily_unavailable') setAlert(unavailableAlert());
      else setAlert(unexpectedAlert(outcome.requestId));
    } catch {
      setAlert(unexpectedAlert('client-error'));
    }
    setSubmitting(false);
  }

  if (sent) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Icon name="mail" className="size-6" />
        </span>
        <h2 className="text-lg font-semibold text-text">{sentTitle}</h2>
        <div className="text-sm text-muted">{sentBody}</div>
        <Button variant="ghost" size="sm" onClick={() => setSent(false)}>
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormAlert state={alert} />
      <Field id={`${idPrefix}-email`} label="Email" error={errors['email']}>
        {(control) => (
          <Input
            {...control}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            required
          />
        )}
      </Field>
      <Button type="submit" size="lg" loading={submitting} loadingLabel={submittingLabel} className="w-full">
        {submitLabel}
      </Button>
      {footer}
    </form>
  );
}
