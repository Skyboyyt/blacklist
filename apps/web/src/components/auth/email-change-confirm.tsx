'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { getAuthApi } from '@/lib/api/browser';
import { useFragmentToken } from '@/lib/auth/use-fragment-token';
import {
  FormAlert,
  rateLimitedAlert,
  unavailableAlert,
  unexpectedAlert,
  type FormAlertState,
} from './form-alert';
import { FlowSuccess, TokenProblem } from './token-problem';

type Outcome =
  | { readonly kind: 'idle' }
  | { readonly kind: 'success' }
  | { readonly kind: 'problem'; readonly status: 'invalid' | 'expired' | 'used' | 'superseded' };

/** Confirmation needs an explicit click (POST): opening the link alone changes nothing. */
export function EmailChangeConfirm() {
  const token = useFragmentToken();
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });

  if (token.kind === 'reading') return <Spinner label="Checking your link…" />;
  if (token.kind !== 'present') {
    return (
      <TokenProblem
        status={token.kind === 'missing' ? 'missing' : 'invalid'}
        retryHref="/settings/security"
        retryLabel="Go to security settings"
      />
    );
  }
  if (outcome.kind === 'problem')
    return (
      <TokenProblem
        status={outcome.status}
        retryHref="/settings/security"
        retryLabel="Go to security settings"
      />
    );
  if (outcome.kind === 'success') {
    return (
      <FlowSuccess
        title="Email address changed"
        body="Use your new email address the next time you sign in."
        href="/login"
        cta="Sign in"
      />
    );
  }
  const tokenValue = token.token;

  async function confirm() {
    if (submitting) return;
    setAlert({ kind: 'none' });
    setSubmitting(true);
    try {
      const res = await (await getAuthApi()).confirmEmailChange(tokenValue);
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
    <div className="flex flex-col gap-4">
      <FormAlert state={alert} />
      <p className="text-sm text-muted">
        Confirm that you want to use this email address for your Blacklist account.
      </p>
      <Button size="lg" onClick={confirm} loading={submitting} loadingLabel="Confirming…" className="w-full">
        Confirm email change
      </Button>
    </div>
  );
}
