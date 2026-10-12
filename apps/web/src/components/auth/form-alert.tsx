import type { AccountError } from '@blacklist/contracts';
import { Notice } from '@/components/app/notice';
import { accountErrorCopy, rateLimitCopy, TEMPORARILY_UNAVAILABLE } from '@/lib/auth/account-error-copy';

export type FormAlertState =
  | { readonly kind: 'none' }
  | { readonly kind: 'error'; readonly title: string; readonly message?: string; readonly reference?: string }
  | { readonly kind: 'warning'; readonly title: string; readonly message?: string };

/**
 * Form-level message. role="alert" announces it when it appears after a submit.
 * Messages are generic (no account enumeration, no internals).
 */
export function FormAlert({ state }: { readonly state: FormAlertState }) {
  if (state.kind === 'none') return null;
  return (
    <Notice
      role="alert"
      tone={state.kind === 'error' ? 'danger' : 'warning'}
      title={state.title}
      className="mb-4"
    >
      {state.message}
      {state.kind === 'error' && state.reference ? (
        <span className="mt-1 block text-xs">
          Reference: <span className="identifier">{state.reference}</span>
        </span>
      ) : null}
    </Notice>
  );
}

export function rateLimitedAlert(retryAfterSeconds?: number): FormAlertState {
  const copy = rateLimitCopy(retryAfterSeconds);
  return { kind: 'warning', title: copy.title, message: copy.body };
}

export function unavailableAlert(): FormAlertState {
  return { kind: 'warning', title: TEMPORARILY_UNAVAILABLE.title, message: TEMPORARILY_UNAVAILABLE.body };
}

/** Unknown failure: says what is safe to say and gives a reference for support. */
export function unexpectedAlert(reference: string): FormAlertState {
  return {
    kind: 'error',
    title: 'We couldn’t complete this request',
    message: 'Nothing was changed. Please try again in a moment.',
    reference,
  };
}

export function accountErrorAlert(error: AccountError): FormAlertState {
  const copy = accountErrorCopy(error);
  const kind =
    error.code === 'rate_limited' ||
    error.code === 'temporarily_unavailable' ||
    error.code === 'cooling_period'
      ? 'warning'
      : 'error';
  return { kind, title: copy.title, message: copy.body };
}
