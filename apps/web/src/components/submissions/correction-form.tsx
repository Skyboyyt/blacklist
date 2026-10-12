'use client';

import { correctionRequestSchema, type EvidenceFile } from '@blacklist/contracts';
import { useRouter } from 'next/navigation';
import { useCallback, useState, type FormEvent } from 'react';
import { FormAlert, type FormAlertState } from '@/components/auth/form-alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getMemberApi } from '@/lib/api/browser';
import { issuesToErrors, memberErrorAlert } from '@/lib/submissions/errors';
import { EvidenceUpload } from './evidence-upload';

export interface CorrectionTarget {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly domains: readonly string[];
}

/**
 * Correction request for a project profile (moderation §6.2 mechanism 5: anyone with an
 * account; no standing needed). Staff decide; an accepted correction becomes a new staff
 * revision of the profile.
 */
export function CorrectionForm({ target }: { readonly target: CorrectionTarget }) {
  const router = useRouter();
  const [statement, setStatement] = useState('');
  const [description, setDescription] = useState('');
  const [addDomain, setAddDomain] = useState('');
  const [retireDomain, setRetireDomain] = useState('');
  const [evidence, setEvidence] = useState<readonly EvidenceFile[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const [pending, setPending] = useState(false);
  const onEvidence = useCallback((files: readonly EvidenceFile[]) => setEvidence(files), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const parsed = correctionRequestSchema.safeParse({
      projectSlug: target.slug,
      statement,
      ...(description.trim() ? { description } : {}),
      ...(addDomain.trim() ? { addDomain } : {}),
      ...(retireDomain ? { retireDomain } : {}),
      evidence: [...evidence],
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
      const result = await (await getMemberApi()).submitCorrection(parsed.data);
      if (result.kind === 'ok') {
        router.push(`/corrections/${result.data.id}`);
        return;
      }
      if (result.code === 'invalid') setErrors(result.fieldErrors);
      setAlert(memberErrorAlert(result));
    } catch {
      setAlert({
        kind: 'error',
        title: 'The correction couldn’t be sent',
        message: 'Nothing was saved. Try again.',
      });
    }
    setPending(false);
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      <FormAlert state={alert} />
      <section
        aria-labelledby="current-profile"
        className="rounded-md border border-border bg-surface-2 p-3 text-sm"
      >
        <h2 id="current-profile" className="font-medium text-text">
          Current profile: {target.name}
        </h2>
        <p className="mt-1 whitespace-pre-wrap text-muted">{target.description}</p>
        <p className="mt-1 text-xs text-muted">
          Official domains: {target.domains.length > 0 ? target.domains.join(', ') : 'none'}
        </p>
      </section>
      <Field
        id="cor-description"
        label="New description (optional)"
        hint="Leave empty to keep the current description."
        error={errors['description']}
      >
        {(control) => (
          <Textarea
            {...control}
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="cor-add"
          label="Add an official domain (optional)"
          hint="For example: docs.example.org"
          error={errors['addDomain']}
        >
          {(control) => (
            <Input
              {...control}
              value={addDomain}
              spellCheck={false}
              onChange={(e) => setAddDomain(e.target.value)}
            />
          )}
        </Field>
        <Field id="cor-retire" label="Retire an official domain (optional)" error={errors['retireDomain']}>
          {(control) => (
            <Select {...control} value={retireDomain} onChange={(e) => setRetireDomain(e.target.value)}>
              <option value="">Keep all domains</option>
              {target.domains.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field
        id="cor-statement"
        label="Why is this correct?"
        hint="Point to evidence staff can check."
        error={errors['statement']}
      >
        {(control) => (
          <Textarea {...control} rows={4} value={statement} onChange={(e) => setStatement(e.target.value)} />
        )}
      </Field>
      <EvidenceUpload label="Supporting images" onChange={onEvidence} error={errors['evidence']} />
      <Button type="submit" size="lg" loading={pending} loadingLabel="Sending…" className="w-fit">
        Send correction request
      </Button>
    </form>
  );
}
