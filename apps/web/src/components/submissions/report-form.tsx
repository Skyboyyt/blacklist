'use client';

import {
  CHAIN_SLUGS,
  reportCategorySchema,
  reportRequestSchema,
  type ChainSlugDto,
  type EvidenceFile,
  type ReportCategory,
} from '@blacklist/contracts';
import { useRouter } from 'next/navigation';
import { useCallback, useState, type FormEvent } from 'react';
import { FormAlert, type FormAlertState } from '@/components/auth/form-alert';
import { CHAIN_NAMES } from '@/components/app/chain-badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getMemberApi } from '@/lib/api/browser';
import { CATEGORY_LABEL } from '@/lib/staff/copy';
import { issuesToErrors, memberErrorAlert } from '@/lib/submissions/errors';
import { EvidenceUpload } from './evidence-upload';
import { RepeatableRows } from './repeatable-rows';

interface Pair {
  chain: ChainSlugDto;
  value: string;
}

/**
 * Private scam report (PRD §5.11). Every address and transaction is tied to a network
 * the reporter chooses; nothing is matched across networks. URLs are kept as text and
 * never opened. The report has no public effect until staff publish a finding.
 */
export function ReportForm() {
  const router = useRouter();
  const [category, setCategory] = useState<ReportCategory>('phishing');
  const [title, setTitle] = useState('');
  const [subjects, setSubjects] = useState<Pair[]>([{ chain: 'ethereum', value: '' }]);
  const [narrative, setNarrative] = useState('');
  const [incidentDate, setIncidentDate] = useState('');
  const [lossAmount, setLossAmount] = useState('');
  const [lossAsset, setLossAsset] = useState('');
  const [txRefs, setTxRefs] = useState<Pair[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [evidence, setEvidence] = useState<readonly EvidenceFile[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const [pending, setPending] = useState(false);
  const onEvidence = useCallback((files: readonly EvidenceFile[]) => setEvidence(files), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const request = {
      category,
      title,
      subjects: subjects.map((s) => ({ chain: s.chain, address: s.value })),
      narrative,
      incidentDate,
      ...(lossAmount.trim() ? { lossAmount } : {}),
      ...(lossAsset.trim() ? { lossAsset } : {}),
      txRefs: txRefs.map((t) => ({ chain: t.chain, hash: t.value })),
      urls,
      evidence: [...evidence],
    };
    const parsed = reportRequestSchema.safeParse(request);
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      setAlert({ kind: 'error', title: 'Check the highlighted fields', message: 'Nothing was sent.' });
      return;
    }
    setErrors({});
    setAlert({ kind: 'none' });
    setPending(true);
    try {
      const result = await (await getMemberApi()).submitReport(parsed.data);
      if (result.kind === 'ok') {
        router.push(`/reports/${result.data.id}`);
        return;
      }
      if (result.code === 'invalid') setErrors(result.fieldErrors);
      setAlert(memberErrorAlert(result));
    } catch {
      setAlert({
        kind: 'error',
        title: 'The report couldn’t be sent',
        message: 'Nothing was saved. Try again.',
      });
    }
    setPending(false);
  }

  const chainSelect = (id: string, value: ChainSlugDto, onChange: (c: ChainSlugDto) => void) => (
    <Field id={id} label="Network">
      {(control) => (
        <Select {...control} value={value} onChange={(e) => onChange(e.target.value as ChainSlugDto)}>
          {CHAIN_SLUGS.map((c) => (
            <option key={c} value={c}>
              {CHAIN_NAMES[c]}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      <FormAlert state={alert} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="report-category" label="What kind of scam?">
          {(control) => (
            <Select
              {...control}
              value={category}
              onChange={(e) => setCategory(e.target.value as ReportCategory)}
            >
              {reportCategorySchema.options.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="report-date" label="When did it happen?" error={errors['incidentDate']}>
          {(control) => (
            <Input
              {...control}
              type="date"
              value={incidentDate}
              onChange={(e) => setIncidentDate(e.target.value)}
            />
          )}
        </Field>
      </div>
      <Field
        id="report-title"
        label="Short title"
        hint="For example: Fake support account asked for a payment."
        error={errors['title']}
      >
        {(control) => (
          <Input {...control} value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} />
        )}
      </Field>
      <RepeatableRows
        legend="Address"
        hint="The address or contract involved, on the network where you saw it."
        rows={subjects}
        min={1}
        max={5}
        addLabel="Add another address"
        empty={(): Pair => ({ chain: 'ethereum', value: '' })}
        onChange={setSubjects}
        renderRow={(row, i, update) => (
          <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
            {chainSelect(`report-subject-chain-${i}`, row.chain, (chain) => update({ ...row, chain }))}
            <Field
              id={`report-subject-${i}`}
              label={`Address ${i + 1}`}
              error={errors[`subjects.${i}.address`]}
            >
              {(control) => (
                <Input
                  {...control}
                  value={row.value}
                  spellCheck={false}
                  autoComplete="off"
                  className="identifier"
                  onChange={(e) => update({ ...row, value: e.target.value })}
                />
              )}
            </Field>
          </div>
        )}
      />
      {errors['subjects'] ? <p className="text-sm text-danger">{errors['subjects']}</p> : null}
      <Field
        id="report-narrative"
        label="What happened?"
        hint="Plain text. Describe the steps in order. Your words are never published."
        error={errors['narrative']}
      >
        {(control) => (
          <Textarea {...control} rows={6} value={narrative} onChange={(e) => setNarrative(e.target.value)} />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="report-loss" label="Amount lost (optional)" error={errors['lossAmount']}>
          {(control) => (
            <Input
              {...control}
              inputMode="decimal"
              value={lossAmount}
              onChange={(e) => setLossAmount(e.target.value)}
            />
          )}
        </Field>
        <Field id="report-asset" label="Asset (optional)" hint="For example: ETH, USDC">
          {(control) => (
            <Input
              {...control}
              maxLength={20}
              value={lossAsset}
              onChange={(e) => setLossAsset(e.target.value)}
            />
          )}
        </Field>
      </div>
      <RepeatableRows
        legend="Transaction"
        hint="Transaction hashes are checked against finalized chain data by the service (not in the demo)."
        rows={txRefs}
        max={10}
        addLabel="Add a transaction hash"
        empty={(): Pair => ({ chain: 'ethereum', value: '' })}
        onChange={setTxRefs}
        renderRow={(row, i, update) => (
          <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
            {chainSelect(`report-tx-chain-${i}`, row.chain, (chain) => update({ ...row, chain }))}
            <Field
              id={`report-tx-${i}`}
              label={`Transaction hash ${i + 1}`}
              error={errors[`txRefs.${i}.hash`]}
            >
              {(control) => (
                <Input
                  {...control}
                  value={row.value}
                  spellCheck={false}
                  autoComplete="off"
                  className="identifier"
                  onChange={(e) => update({ ...row, value: e.target.value })}
                />
              )}
            </Field>
          </div>
        )}
      />
      <RepeatableRows
        legend="Link"
        hint="Links are stored as text and never opened by Blacklist."
        rows={urls}
        max={10}
        addLabel="Add a link"
        empty={() => ''}
        onChange={setUrls}
        renderRow={(row, i, update) => (
          <Field id={`report-url-${i}`} label={`Link ${i + 1}`} error={errors[`urls.${i}`]}>
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
      <EvidenceUpload label="Screenshots" onChange={onEvidence} error={errors['evidence']} />
      <Button type="submit" size="lg" loading={pending} loadingLabel="Sending…" className="w-fit">
        Send private report
      </Button>
    </form>
  );
}
