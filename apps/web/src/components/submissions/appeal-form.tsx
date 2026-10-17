'use client';

import { appealRequestSchema, type AppealTarget } from '@blacklist/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { FormAlert, type FormAlertState } from '@/components/auth/form-alert';
import { ChainBadge } from '@/components/app/chain-badge';
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
  | { readonly kind: 'ready'; readonly target: AppealTarget }
  | { readonly kind: 'problem'; readonly alert: FormAlertState };

/**
 * Appeal against a published finding (moderation §9). Standing is decided per case
 * (§6) through the shared standing controls: simulated checks say so; documentary
 * standing goes to a staff standing reviewer. The finding stays visible as "Disputed —
 * under appeal" while it is reviewed. Never asks for seed phrases or transaction signatures.
 */
export function AppealForm({ findingId }: { readonly findingId: string }) {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [grounds, setGrounds] = useState('');
  const [standing, setStanding] = useState<StandingState>(INITIAL_STANDING);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await (await getMemberApi()).getAppealTarget(findingId);
        if (!active) return;
        setLoad(
          result.kind === 'ok'
            ? { kind: 'ready', target: result.data }
            : { kind: 'problem', alert: memberErrorAlert(result) },
        );
      } catch {
        if (active)
          setLoad({ kind: 'problem', alert: { kind: 'error', title: 'The finding couldn’t be loaded' } });
      }
    })();
    return () => {
      active = false;
    };
  }, [findingId]);

  async function loadChallenge(): Promise<StandingChallengeView | null> {
    const result = await (await getMemberApi()).getStandingChallenge(findingId);
    if (result.kind === 'ok') return result.data;
    setAlert(memberErrorAlert(result));
    return null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const proof = standingProof(standing, load.kind === 'ready' ? load.target.subject.chain : undefined);
    if (!proof.ok) {
      setErrors({ standing: proof.message });
      return;
    }
    const parsed = appealRequestSchema.safeParse({ findingId, grounds, standing: proof.proof });
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      setAlert({ kind: 'error', title: 'Check the highlighted fields', message: 'Nothing was sent.' });
      return;
    }
    setErrors({});
    setAlert({ kind: 'none' });
    setPending(true);
    try {
      const result = await (await getMemberApi()).submitAppeal(parsed.data);
      if (result.kind === 'ok') {
        router.push(`/appeals/${result.data.id}`);
        return;
      }
      if (result.code === 'invalid') setErrors(result.fieldErrors);
      setAlert(memberErrorAlert(result));
    } catch {
      setAlert({
        kind: 'error',
        title: 'The appeal couldn’t be sent',
        message: 'Nothing was saved. Try again.',
      });
    }
    setPending(false);
  }

  if (load.kind === 'loading') return <LoadingStatus label="Loading the finding…" />;
  if (load.kind === 'problem') return <FormAlert state={load.alert} />;
  const { target } = load;

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      <section
        aria-labelledby="appeal-finding"
        className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm"
      >
        <h2 id="appeal-finding" className="font-medium text-text">
          Finding you are appealing
        </h2>
        <p className="text-text">{target.title}</p>
        <p className="text-muted">{target.summary}</p>
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <ChainBadge chain={target.subject.chain} />
          <span className="identifier break-all">{target.subject.address}</span>
        </p>
      </section>
      {target.alreadyAppealed ? (
        <Notice tone="info" title="You already have an open appeal against this finding">
          Follow it from your dashboard. A new appeal needs new evidence after a decision.
        </Notice>
      ) : null}
      <FormAlert state={alert} />
      <Field
        id="appeal-grounds"
        label="Why is the finding wrong?"
        hint="Plain text. Refer to evidence staff can check."
        error={errors['grounds']}
      >
        {(control) => (
          <Textarea {...control} rows={5} value={grounds} onChange={(e) => setGrounds(e.target.value)} />
        )}
      </Field>
      <StandingFields
        idPrefix="appeal"
        subjectKind={target.subjectKind}
        domains={[]}
        value={standing}
        onChange={setStanding}
        loadChallenge={loadChallenge}
        subject={target.subject}
        errors={errors}
      />

      <Button
        type="submit"
        size="lg"
        loading={pending}
        loadingLabel="Sending…"
        className="w-fit"
        disabled={target.alreadyAppealed}
      >
        Send appeal
      </Button>
    </form>
  );
}
