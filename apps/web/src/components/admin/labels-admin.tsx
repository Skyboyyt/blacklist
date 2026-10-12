'use client';

import { CHAIN_SLUGS, labelRequestSchema, type AdminLabel, type ChainSlugDto } from '@blacklist/contracts';
import { useState, type FormEvent } from 'react';
import { FormAlert, type FormAlertState } from '@/components/auth/form-alert';
import { ChainBadge, CHAIN_NAMES } from '@/components/app/chain-badge';
import { DataCard } from '@/components/app/data-card';
import { LoadingStatus } from '@/components/states/skeletons';
import { ProtectedAction, useProtectedAction } from '@/components/staff/protected-action';
import { AccessDenied, StaffLoadError } from '@/components/staff/staff-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getAdminApi } from '@/lib/api/browser';
import type { AdminApi } from '@/lib/api/types';
import { truncateMiddle } from '@/lib/format/address';
import { formatDateUtc } from '@/lib/format/date';
import { moderationErrorAlert } from '@/lib/staff/errors';
import { issuesToErrors } from '@/lib/submissions/errors';
import { useAdminData, verifyAdminStepUp } from './use-admin-data';

const read = (api: AdminApi) => api.listLabels();
type Provenance = AdminLabel['provenance'];

/**
 * Public labels (label:manage). A label identifies an address with its provenance; it
 * is not a risk factor and never changes the band. Retiring keeps the record.
 */
export function LabelsAdmin() {
  const { load, reload } = useAdminData(read);
  const [chain, setChain] = useState<ChainSlugDto>('ethereum');
  const [address, setAddress] = useState('');
  const [text, setText] = useState('');
  const [provenance, setProvenance] = useState<Provenance>('moderator_finding');
  const [sourceName, setSourceName] = useState('');
  const [basisNote, setBasisNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const [pending, setPending] = useState(false);
  const { request, start: setRequest, close } = useProtectedAction();

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const parsed = labelRequestSchema.safeParse({
      chain,
      address,
      text,
      provenance,
      ...(provenance === 'external_source' ? { sourceName } : {}),
      basisNote,
    });
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setPending(true);
    const result = await (await getAdminApi()).addLabel(parsed.data);
    setPending(false);
    if (result.kind === 'ok') {
      setAlert({
        kind: 'warning',
        title: 'Label added',
        message: 'It now shows on the public address page.',
      });
      setAddress('');
      setText('');
      setSourceName('');
      setBasisNote('');
      await reload();
    } else setAlert(moderationErrorAlert(result));
  }

  function retire(l: AdminLabel) {
    setRequest({
      title: `Retire “${l.text}”?`,
      description: 'The label is removed from the public page. The record is kept.',
      tone: 'danger',
      reasonLabel: 'Internal reason (staff only)',
      run: async (reason) => {
        const result = await (await getAdminApi()).retireLabel(l.id, reason);
        setAlert(
          result.kind === 'ok' ? { kind: 'warning', title: 'Label retired' } : moderationErrorAlert(result),
        );
        await reload();
      },
    });
  }

  if (load.kind === 'loading') return <LoadingStatus label="Loading labels…" />;
  if (load.kind === 'error') return <StaffLoadError onRetry={() => void reload()} />;
  if (load.kind === 'forbidden') return <AccessDenied detail={load.detail} />;

  return (
    <div className="flex flex-col gap-6">
      <FormAlert state={alert} />
      <DataCard title="Add a public label" description="Labels identify; they never add to or reduce risk.">
        <form noValidate onSubmit={add} className="grid gap-4 sm:grid-cols-2">
          <Field id="label-chain" label="Network">
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
          <Field id="label-address" label="Address" error={errors['address']}>
            {(control) => (
              <Input
                {...control}
                value={address}
                spellCheck={false}
                onChange={(e) => setAddress(e.target.value)}
              />
            )}
          </Field>
          <Field id="label-text" label="Label text" error={errors['text']}>
            {(control) => (
              <Input {...control} value={text} maxLength={60} onChange={(e) => setText(e.target.value)} />
            )}
          </Field>
          <Field id="label-provenance" label="Source">
            {(control) => (
              <Select
                {...control}
                value={provenance}
                onChange={(e) => setProvenance(e.target.value as Provenance)}
              >
                <option value="moderator_finding">Verified by staff</option>
                <option value="external_source">External source</option>
              </Select>
            )}
          </Field>
          {provenance === 'external_source' ? (
            <Field id="label-source-name" label="External source name" error={errors['sourceName']}>
              {(control) => (
                <Input {...control} value={sourceName} onChange={(e) => setSourceName(e.target.value)} />
              )}
            </Field>
          ) : null}
          <div className="sm:col-span-2">
            <Field id="label-basis" label="Basis (staff only)" error={errors['basisNote']}>
              {(control) => (
                <Textarea
                  {...control}
                  rows={2}
                  value={basisNote}
                  onChange={(e) => setBasisNote(e.target.value)}
                />
              )}
            </Field>
          </div>
          <Button type="submit" loading={pending} loadingLabel="Adding…" className="w-fit">
            Add label
          </Button>
        </form>
      </DataCard>
      <ul className="flex flex-col gap-3">
        {load.data.map((l) => (
          <li
            key={l.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:justify-between"
          >
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium break-words text-text">{l.text}</span>
                <Badge tone={l.status === 'active' ? 'positive' : 'neutral'}>
                  {l.status === 'active' ? 'Active' : 'Retired'}
                </Badge>
              </p>
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <ChainBadge chain={l.subject.chain} />
                <span className="identifier" title={l.subject.address}>
                  {truncateMiddle(l.subject.displayAddress, 10, 8)}
                </span>
                <span>
                  {l.provenance === 'external_source'
                    ? `External: ${l.sourceName ?? ''}`
                    : 'Verified by staff'}{' '}
                  · added by {l.createdBy.handle} on {formatDateUtc(l.createdAt)}
                </span>
              </p>
              <p className="text-xs break-words text-muted">Basis: {l.basisNote}</p>
            </div>
            {l.status === 'active' ? (
              <Button size="sm" variant="secondary" onClick={() => retire(l)}>
                Retire<span className="sr-only"> {l.text}</span>
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <ProtectedAction request={request} onClose={close} verify={verifyAdminStepUp} />
    </div>
  );
}
