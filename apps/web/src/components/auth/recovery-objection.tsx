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

type Operation = 'object' | 'withdraw';
type Outcome =
  | { readonly kind: 'idle' }
  | { readonly kind: 'done'; readonly operation: Operation }
  | { readonly kind: 'problem'; readonly status: 'invalid' | 'expired' | 'used' | 'superseded' };

/**
 * The recovery subject's objection link (ADR 0013 C2). It records an objection, and
 * then once its withdrawal; it signs nobody in and grants nothing else. Opening the
 * link changes nothing: each action needs an explicit click (POST).
 */
export function RecoveryObjection() {
  const token = useFragmentToken();
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const [submitting, setSubmitting] = useState<Operation | null>(null);
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });

  if (token.kind === 'reading') return <Spinner label="Checking your link…" />;
  if (token.kind !== 'present' || outcome.kind === 'problem')
    return (
      <TokenProblem
        status={
          outcome.kind === 'problem' ? outcome.status : token.kind === 'missing' ? 'missing' : 'invalid'
        }
        retryHref="/login"
        retryLabel="Go to sign in"
      />
    );
  const tokenValue = token.token;

  async function send(operation: Operation) {
    if (submitting) return;
    setAlert({ kind: 'none' });
    setSubmitting(operation);
    try {
      const res = await (await getAuthApi()).staffRecoveryObjection(tokenValue, operation);
      if (res.kind === 'success') setOutcome({ kind: 'done', operation });
      else if (res.kind === 'token_problem') setOutcome({ kind: 'problem', status: res.status });
      else if (res.kind === 'rate_limited') setAlert(rateLimitedAlert(res.retryAfterSeconds));
      else if (res.kind === 'temporarily_unavailable') setAlert(unavailableAlert());
      else if (res.kind === 'unexpected_error') setAlert(unexpectedAlert(res.requestId));
      else setAlert(unexpectedAlert('unexpected-outcome'));
    } catch {
      setAlert(unexpectedAlert('client-error'));
    }
    setSubmitting(null);
  }

  if (outcome.kind === 'done' && outcome.operation === 'withdraw')
    return (
      <FlowSuccess
        title="Objection withdrawn"
        body="The recovery continues. A new 24-hour objection window has started, and you will get a new email."
        href="/login"
        cta="Go to sign in"
      />
    );
  if (outcome.kind === 'done')
    return (
      <div className="flex flex-col gap-4">
        <FlowSuccess
          title="Objection recorded"
          body="The recovery is stopped and every administrator has been told. Nothing on your account was changed."
          href="/login"
          cta="Go to sign in"
        />
        <FormAlert state={alert} />
        <p className="text-sm text-muted">
          Objected by mistake? You can withdraw it once, within 24 hours, from this page or the same link.
        </p>
        <Button
          variant="secondary"
          onClick={() => void send('withdraw')}
          loading={submitting === 'withdraw'}
          loadingLabel="Withdrawing…"
          className="w-full"
        >
          Withdraw my objection
        </Button>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <FormAlert state={alert} />
      <p className="text-sm text-muted">
        Someone approved a recovery of your Blacklist staff account. If you did not ask for it, object now:
        the recovery stops and every administrator is told. This page does not sign you in.
      </p>
      <Button
        size="lg"
        variant="danger"
        onClick={() => void send('object')}
        loading={submitting === 'object'}
        loadingLabel="Recording…"
        className="w-full"
      >
        I did not ask for this: object
      </Button>
      <Button
        variant="ghost"
        onClick={() => void send('withdraw')}
        loading={submitting === 'withdraw'}
        loadingLabel="Withdrawing…"
        className="w-full"
      >
        Already objected? Withdraw my objection
      </Button>
    </div>
  );
}
