'use client';

import { responseRequestSchema, type ResponseTarget, type ResponseTargetRef } from '@blacklist/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { FormAlert, type FormAlertState } from '@/components/auth/form-alert';
import { Notice } from '@/components/app/notice';
import { LoadingStatus } from '@/components/states/skeletons';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { getMemberApi } from '@/lib/api/browser';
import type { StandingChallengeView } from '@/lib/api/types';
import { issuesToErrors, memberErrorAlert } from '@/lib/submissions/errors';
import { INITIAL_STANDING, StandingFields, standingProof, type StandingState } from './standing-fields';

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly target: ResponseTarget }
  | { readonly kind: 'problem'; readonly alert: FormAlertState };

/**
 * Right-of-reply response (moderation §9). A party with standing writes a plain-text
 * statement; staff check it for safety (personal data, abuse, malicious links), not
 * viewpoint, before it is published. It never hides or changes a finding.
 */
export function ResponseForm({ target: ref }: { readonly target: ResponseTargetRef }) {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [body, setBody] = useState('');
  const [standing, setStanding] = useState<StandingState>(INITIAL_STANDING);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const [pending, setPending] = useState(false);
  const key = JSON.stringify(ref);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await (await getMemberApi()).getResponseTarget(JSON.parse(key) as ResponseTargetRef);
        if (!active) return;
        setLoad(
          result.kind === 'ok'
            ? { kind: 'ready', target: result.data }
            : { kind: 'problem', alert: memberErrorAlert(result) },
        );
      } catch {
        if (active)
          setLoad({ kind: 'problem', alert: { kind: 'error', title: 'The subject couldn’t be loaded' } });
      }
    })();
    return () => {
      active = false;
    };
  }, [key]);

  async function loadChallenge(): Promise<StandingChallengeView | null> {
    if (load.kind !== 'ready') return null;
    const result = await (await getMemberApi()).getResponseChallenge(load.target.target);
    if (result.kind === 'ok') return result.data;
    setAlert(memberErrorAlert(result));
    return null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || load.kind !== 'ready') return;
    const ref = load.target.target;
    const proof = standingProof(standing, ref.kind === 'address' ? ref.chain : undefined);
    if (!proof.ok) {
      setErrors({ standing: proof.message });
      return;
    }
    const parsed = responseRequestSchema.safeParse({
      target: load.target.target,
      body,
      standing: proof.proof,
    });
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      setAlert({ kind: 'error', title: 'Check the highlighted fields', message: 'Nothing was sent.' });
      return;
    }
    setErrors({});
    setAlert({ kind: 'none' });
    setPending(true);
    try {
      const result = await (await getMemberApi()).submitResponse(parsed.data);
      if (result.kind === 'ok') {
        router.push(`/responses/${result.data.id}`);
        return;
      }
      if (result.code === 'invalid') setErrors(result.fieldErrors);
      setAlert(memberErrorAlert(result));
    } catch {
      setAlert({
        kind: 'error',
        title: 'The response couldn’t be sent',
        message: 'Nothing was saved. Try again.',
      });
    }
    setPending(false);
  }

  if (load.kind === 'loading') return <LoadingStatus label="Loading the subject…" />;
  if (load.kind === 'problem') return <FormAlert state={load.alert} />;
  const { target } = load;

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      <section
        aria-labelledby="response-subject"
        className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm"
      >
        <h2 id="response-subject" className="font-medium text-text">
          You are responding about
        </h2>
        <p className="identifier break-all text-text">{target.title}</p>
      </section>
      {target.alreadyResponding ? (
        <Notice tone="info" title="You already have a response under review for this subject">
          Follow it from your dashboard.
        </Notice>
      ) : null}
      <FormAlert state={alert} />
      <Field
        id="response-body"
        label="Your response"
        hint="Plain text, up to 5,000 characters. It is published as written if staff approve it. Do not include personal data about anyone."
        error={errors['body']}
      >
        {(control) => (
          <Textarea {...control} rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
        )}
      </Field>
      <StandingFields
        idPrefix="response"
        subjectKind={target.subjectKind}
        domains={target.domains}
        value={standing}
        onChange={setStanding}
        loadChallenge={loadChallenge}
        subject={
          target.target.kind === 'address'
            ? { chain: target.target.chain, address: target.target.address }
            : null
        }
        errors={errors}
      />
      <Button
        type="submit"
        size="lg"
        loading={pending}
        loadingLabel="Sending…"
        className="w-fit"
        disabled={target.alreadyResponding}
      >
        Send response for review
      </Button>
    </form>
  );
}
