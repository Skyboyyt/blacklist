'use client';

import {
  CHAIN_SLUGS,
  PROJECT_CATEGORIES,
  suggestionRequestSchema,
  type ChainSlugDto,
  type EvidenceFile,
  type ProjectCategory,
} from '@blacklist/contracts';
import { useRouter } from 'next/navigation';
import { useCallback, useState, type FormEvent } from 'react';
import { FormAlert, type FormAlertState } from '@/components/auth/form-alert';
import { CHAIN_NAMES } from '@/components/app/chain-badge';
import { Notice } from '@/components/app/notice';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getMemberApi } from '@/lib/api/browser';
import { CATEGORY_LABEL } from '@/lib/projects/copy';
import { issuesToErrors, memberErrorAlert } from '@/lib/submissions/errors';
import { EvidenceUpload } from './evidence-upload';
import { RepeatableRows } from './repeatable-rows';

/**
 * Private project suggestion (ADR 0010 Part A). Staff review it and may publish a
 * profile. Submitting it, connecting a wallet or typing a contract address does not
 * prove ownership, and nothing is public until staff publish a profile revision.
 */
export function SuggestionForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ProjectCategory>('defi');
  const [chain, setChain] = useState<ChainSlugDto>('ethereum');
  const [identifier, setIdentifier] = useState('');
  const [links, setLinks] = useState<string[]>(['']);
  const [description, setDescription] = useState('');
  const [relationship, setRelationship] = useState('');
  const [evidence, setEvidence] = useState<readonly EvidenceFile[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const [pending, setPending] = useState(false);
  const onEvidence = useCallback((files: readonly EvidenceFile[]) => setEvidence(files), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const parsed = suggestionRequestSchema.safeParse({
      name,
      category,
      chain,
      identifier,
      links,
      description,
      relationship,
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
      const result = await (await getMemberApi()).submitSuggestion(parsed.data);
      if (result.kind === 'ok') {
        router.push(`/projects/suggestions/${result.data.id}`);
        return;
      }
      if (result.code === 'invalid') setErrors(result.fieldErrors);
      setAlert(memberErrorAlert(result));
    } catch {
      setAlert({
        kind: 'error',
        title: 'The suggestion couldn’t be sent',
        message: 'Nothing was saved. Try again.',
      });
    }
    setPending(false);
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      <Notice tone="info" title="This does not prove ownership">
        A suggestion is private. Staff check it against independent records before publishing anything.
        Entering a contract address or being able to sign with a wallet does not, on its own, show that you
        represent the project.
      </Notice>
      <FormAlert state={alert} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="sug-name" label="Project name" error={errors['name']}>
          {(control) => (
            <Input {...control} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          )}
        </Field>
        <Field id="sug-category" label="Category">
          {(control) => (
            <Select
              {...control}
              value={category}
              onChange={(e) => setCategory(e.target.value as ProjectCategory)}
            >
              {PROJECT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
        <Field id="sug-chain" label="Network">
          {(control) => (
            <Select {...control} value={chain} onChange={(e) => setChain(e.target.value as ChainSlugDto)}>
              {CHAIN_SLUGS.map((c) => (
                <option key={c} value={c}>
                  {CHAIN_NAMES[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="sug-identifier" label="Contract or mint address" error={errors['identifier']}>
          {(control) => (
            <Input
              {...control}
              value={identifier}
              spellCheck={false}
              autoComplete="off"
              className="identifier"
              onChange={(e) => setIdentifier(e.target.value)}
            />
          )}
        </Field>
      </div>
      <RepeatableRows
        legend="Official link"
        hint="Stored as text and never opened by Blacklist."
        rows={links}
        min={1}
        max={5}
        addLabel="Add another link"
        empty={() => ''}
        onChange={setLinks}
        renderRow={(row, i, update) => (
          <Field id={`sug-link-${i}`} label={`Official link ${i + 1}`} error={errors[`links.${i}`]}>
            {(control) => (
              <Input
                {...control}
                type="url"
                value={row}
                spellCheck={false}
                onChange={(e) => update(e.target.value)}
              />
            )}
          </Field>
        )}
      />
      {errors['links'] ? <p className="text-sm text-danger">{errors['links']}</p> : null}
      <Field
        id="sug-description"
        label="Description"
        hint="What the project does, in plain words."
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
      <Field
        id="sug-relationship"
        label="Your connection to the project"
        hint="For example: team member, or a user who noticed the project has no profile."
        error={errors['relationship']}
      >
        {(control) => (
          <Textarea
            {...control}
            rows={3}
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
          />
        )}
      </Field>
      <EvidenceUpload label="Supporting images" onChange={onEvidence} error={errors['evidence']} />
      <Button type="submit" size="lg" loading={pending} loadingLabel="Sending…" className="w-fit">
        Send suggestion
      </Button>
    </form>
  );
}
