'use client';

import { appealRequestSchema, type AppealTarget, type EvidenceFile } from '@blacklist/contracts';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { FormAlert, type FormAlertState } from '@/components/auth/form-alert';
import { ChainBadge } from '@/components/app/chain-badge';
import { Notice } from '@/components/app/notice';
import { LoadingStatus } from '@/components/states/skeletons';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getMemberApi } from '@/lib/api/browser';
import { issuesToErrors, memberErrorAlert } from '@/lib/submissions/errors';
import { EvidenceUpload } from './evidence-upload';

type Mechanism = 'signature' | 'dns_txt' | 'documentary';
type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly target: AppealTarget }
  | { readonly kind: 'problem'; readonly alert: FormAlertState };

const MECHANISMS: readonly { value: Mechanism; label: string; hint: string }[] = [
  {
    value: 'signature',
    label: 'Sign a message with the address',
    hint: 'Shows you control the address now. It does not prove who you are or what happened in the past.',
  },
  {
    value: 'dns_txt',
    label: 'Add a DNS record',
    hint: 'For domain owners. Shows control of the domain at check time.',
  },
  {
    value: 'documentary',
    label: 'Documents reviewed by staff',
    hint: 'For lost keys, drained wallets, former team members, migrations and organisation representatives.',
  },
];

/**
 * Appeal against a published finding (moderation §9). Standing is decided per case
 * (§6): signature and DNS checks are SIMULATED in the demo and say so; documentary
 * standing goes to a staff standing reviewer. The finding stays visible as "Disputed —
 * under appeal" while it is reviewed. Never asks for seed phrases or transaction signatures.
 */
export function AppealForm({ findingId }: { readonly findingId: string }) {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [grounds, setGrounds] = useState('');
  const [mechanism, setMechanism] = useState<Mechanism>('documentary');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [signed, setSigned] = useState(false);
  const [domain, setDomain] = useState('');
  const [checked, setChecked] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [evidence, setEvidence] = useState<readonly EvidenceFile[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const [pending, setPending] = useState(false);
  const onEvidence = useCallback((files: readonly EvidenceFile[]) => setEvidence(files), []);

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

  async function showChallenge() {
    const result = await (await getMemberApi()).getStandingChallenge(findingId);
    if (result.kind === 'ok') setChallenge(result.data.message);
    else setAlert(memberErrorAlert(result));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (mechanism === 'signature' && !signed) {
      setErrors({ standing: 'Show the message and complete the simulated signature first.' });
      return;
    }
    if (mechanism === 'dns_txt' && !checked) {
      setErrors({ standing: 'Complete the simulated DNS check first.' });
      return;
    }
    const standing =
      mechanism === 'signature'
        ? { mechanism, simulated: true }
        : mechanism === 'dns_txt'
          ? { mechanism, domain, simulated: true }
          : { mechanism, explanation, evidence: [...evidence] };
    const parsed = appealRequestSchema.safeParse({ findingId, grounds, standing });
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
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-text">How will you show standing?</legend>
        {MECHANISMS.map((m) => (
          <div key={m.value} className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
            <input
              id={`standing-${m.value}`}
              type="radio"
              name="mechanism"
              value={m.value}
              checked={mechanism === m.value}
              aria-describedby={`standing-${m.value}-hint`}
              onChange={() => {
                setMechanism(m.value);
                setErrors({});
              }}
              className="mt-1"
            />
            <div>
              <label htmlFor={`standing-${m.value}`} className="font-medium text-text">
                {m.label}
              </label>
              <p id={`standing-${m.value}-hint`} className="text-muted">
                {m.hint}
              </p>
            </div>
          </div>
        ))}
        {errors['standing'] ? (
          <p className="text-sm text-danger" role="alert">
            {errors['standing']}
          </p>
        ) : null}
      </fieldset>

      {mechanism === 'signature' ? (
        <div className="flex flex-col gap-3 rounded-md border border-border p-3">
          <p className="text-sm text-muted">
            You would sign this exact text with the address. It authorizes no transaction or token approval
            and costs nothing. Blacklist never asks for seed phrases, private keys or transaction signatures.
          </p>
          {challenge ? (
            <pre className="identifier overflow-x-auto rounded bg-surface-2 p-3 text-xs whitespace-pre-wrap">
              {challenge}
            </pre>
          ) : (
            <Button variant="secondary" className="w-fit" onClick={() => void showChallenge()}>
              Show the message to sign
            </Button>
          )}
          {challenge ? (
            <Button variant="secondary" className="w-fit" disabled={signed} onClick={() => setSigned(true)}>
              {signed ? 'Signature simulated' : 'Simulate signing (demo only)'}
            </Button>
          ) : null}
        </div>
      ) : null}

      {mechanism === 'dns_txt' ? (
        <div className="flex flex-col gap-3 rounded-md border border-border p-3">
          <Field id="appeal-domain" label="Domain" error={errors['standing.domain']}>
            {(control) => (
              <Input
                {...control}
                value={domain}
                spellCheck={false}
                onChange={(e) => setDomain(e.target.value)}
              />
            )}
          </Field>
          <p className="text-sm text-muted">
            Add a TXT record at{' '}
            <span className="identifier">_blacklist-standing.{domain || 'your-domain'}</span> with the case
            token the service shows you. Blacklist reads DNS only; it never opens your website.
          </p>
          <Button
            variant="secondary"
            className="w-fit"
            disabled={checked || domain.trim() === ''}
            onClick={() => setChecked(true)}
          >
            {checked ? 'DNS check simulated' : 'Simulate DNS check (demo only)'}
          </Button>
        </div>
      ) : null}

      {mechanism === 'documentary' ? (
        <div className="flex flex-col gap-3 rounded-md border border-border p-3">
          <Field
            id="appeal-explanation"
            label="What do the documents show?"
            hint="A staff standing reviewer records what was and was not established."
            error={errors['standing.explanation']}
          >
            {(control) => (
              <Textarea
                {...control}
                rows={3}
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
              />
            )}
          </Field>
          <EvidenceUpload label="Document images" onChange={onEvidence} error={errors['standing.evidence']} />
        </div>
      ) : null}

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
