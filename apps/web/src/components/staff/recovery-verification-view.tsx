'use client';

import { recoveryVerificationSchema, type RecoveryCase } from '@blacklist/contracts';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { FormAlert, type FormAlertState } from '@/components/auth/form-alert';
import { LoadingStatus } from '@/components/states/skeletons';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getModerationApi } from '@/lib/api/browser';
import { formatDateTimeUtc } from '@/lib/format/date';
import { moderationErrorAlert } from '@/lib/staff/errors';
import { AccessDenied, StaffLoadError } from './staff-states';

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'forbidden'; readonly detail: string }
  | { readonly kind: 'ready'; readonly cases: readonly RecoveryCase[] };

/**
 * Identity verification for staff recovery cases (identity §10.11 step 2). Two different
 * staff members, at least one an administrator, each record how they verified the person
 * through a channel other than their email. The subject never sees or verifies their own
 * case. Approval and the objection window stay with administrators.
 */
export function RecoveryVerificationView() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const [methods, setMethods] = useState<Readonly<Record<string, string>>>({});
  const [rationales, setRationales] = useState<Readonly<Record<string, string>>>({});
  const [errors, setErrors] = useState<Readonly<Record<string, { method?: string; rationale?: string }>>>({});
  const [pending, setPending] = useState<string | null>(null);

  const fetchCases = useCallback(async () => {
    try {
      const result = await (await getModerationApi()).listRecoveryVerifications();
      if (result.kind === 'ok') setLoad({ kind: 'ready', cases: result.data });
      else if (result.code === 'forbidden') setLoad({ kind: 'forbidden', detail: result.detail });
      else setLoad({ kind: 'error' });
    } catch {
      setLoad({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    // Initial fetch of external data: the effect subscribes to the API, as React intends.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchCases();
  }, [fetchCases]);

  async function verify(event: FormEvent<HTMLFormElement>, r: RecoveryCase) {
    event.preventDefault();
    if (pending) return;
    const parsed = recoveryVerificationSchema.safeParse({
      method: methods[r.id] ?? '',
      rationale: rationales[r.id] ?? '',
    });
    if (!parsed.success) {
      const fields = new Set(parsed.error.issues.map((issue) => issue.path[0]));
      setErrors({
        ...errors,
        [r.id]: {
          ...(fields.has('method')
            ? { method: 'Say how you verified identity (at least 5 characters).' }
            : {}),
          ...(fields.has('rationale')
            ? { rationale: 'Say why you are confident it is them (at least 10 characters).' }
            : {}),
        },
      });
      return;
    }
    setErrors({ ...errors, [r.id]: {} });
    setPending(r.id);
    try {
      const result = await (
        await getModerationApi()
      ).verifyRecoveryIdentity(r.id, parsed.data.method, parsed.data.rationale);
      if (result.kind === 'ok') {
        setAlert({
          kind: 'warning',
          title: 'Verification recorded',
          message:
            result.data.state === 'awaiting_approval'
              ? 'Both verifications are in. A different administrator than the opener must now approve.'
              : 'One more staff member must verify; at least one of the two must be an administrator.',
        });
        setMethods({ ...methods, [r.id]: '' });
        setRationales({ ...rationales, [r.id]: '' });
      } else setAlert(moderationErrorAlert(result));
      await fetchCases();
    } catch {
      setAlert({ kind: 'error', title: 'The verification was not saved', message: 'Try again in a moment.' });
    } finally {
      setPending(null);
    }
  }

  if (load.kind === 'loading') return <LoadingStatus label="Loading recovery cases…" />;
  if (load.kind === 'error') return <StaffLoadError onRetry={() => void fetchCases()} />;
  if (load.kind === 'forbidden') return <AccessDenied detail={load.detail} />;

  return (
    <div className="flex flex-col gap-4">
      <FormAlert state={alert} />
      <p className="text-sm text-muted">
        Verify the person through a channel you already trust, such as a video call or a known phone number.
        Never use the account email: recovery exists because it may be controlled by someone else. Never ask
        for or accept a password, recovery code or seed phrase.
      </p>
      {load.cases.length === 0 ? (
        <p role="status" className="text-sm text-muted">
          No recovery case is waiting for identity verification.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {load.cases.map((r) => (
            <li key={r.id}>
              <article
                aria-labelledby={`recovery-${r.id}`}
                className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
              >
                <h2 id={`recovery-${r.id}`} className="text-sm font-medium break-words text-text">
                  <span className="identifier">{r.id}</span> · recovery for {r.subject.handle}
                </h2>
                <p className="text-xs text-muted">
                  Opened by {r.openedBy.handle} on {formatDateTimeUtc(r.createdAt)} · {r.verifications.length}{' '}
                  of 2 verifications
                </p>
                {r.verifications.length > 0 ? (
                  <ul className="list-disc pl-5 text-xs text-muted">
                    {r.verifications.map((v) => (
                      <li key={v.verifier.id}>
                        Verified by {v.verifier.handle} on {formatDateTimeUtc(v.at)}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <form noValidate onSubmit={(e) => void verify(e, r)} className="flex flex-col gap-3">
                  <Field
                    id={`verify-${r.id}`}
                    label="How did you verify identity?"
                    hint="For example: video call, call-back to the number on file."
                    error={errors[r.id]?.method}
                  >
                    {(control) => (
                      <Input
                        {...control}
                        value={methods[r.id] ?? ''}
                        onChange={(e) => setMethods({ ...methods, [r.id]: e.target.value })}
                      />
                    )}
                  </Field>
                  <Field
                    id={`rationale-${r.id}`}
                    label="Why are you confident it is them?"
                    hint="Staff only. Recorded in the audit history."
                    error={errors[r.id]?.rationale}
                  >
                    {(control) => (
                      <Textarea
                        {...control}
                        value={rationales[r.id] ?? ''}
                        onChange={(e) => setRationales({ ...rationales, [r.id]: e.target.value })}
                      />
                    )}
                  </Field>
                  <Button type="submit" size="sm" className="w-fit" disabled={pending === r.id}>
                    {pending === r.id ? 'Saving…' : 'Record verification'}
                    <span className="sr-only"> for {r.subject.handle}</span>
                  </Button>
                </form>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
