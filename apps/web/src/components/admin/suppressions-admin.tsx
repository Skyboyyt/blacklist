'use client';

import {
  CHAIN_SLUGS,
  SUPPRESSIBLE_FACTOR_CODES,
  suppressionRequestSchema,
  type ChainSlugDto,
  type SuppressibleFactorCode,
  type Suppression,
} from '@blacklist/contracts';
import { useState } from 'react';
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
import { SUPPRESSIBLE_FACTOR_LABEL } from '@/lib/risk/copy';
import { moderationErrorAlert } from '@/lib/staff/errors';
import { issuesToErrors } from '@/lib/submissions/errors';
import { useAdminData, verifyAdminStepUp } from './use-admin-data';

const read = (api: AdminApi) => api.listSuppressions();

/**
 * Signal suppressions (signal:suppress). Only analysis indicators can be suppressed;
 * findings are suspended or reversed through moderation instead. A suppression is an
 * audited decision and is shown publicly with its reason (PRD §5.14). There is no manual
 * score setting.
 */
export function SuppressionsAdmin() {
  const { load, reload } = useAdminData(read);
  const [chain, setChain] = useState<ChainSlugDto>('solana');
  const [address, setAddress] = useState('');
  const [factorCode, setFactorCode] = useState<SuppressibleFactorCode>('token.symbol_impersonation');
  const [publicReason, setPublicReason] = useState('');
  const [internalRationale, setInternalRationale] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const { request, start: setRequest, close } = useProtectedAction();

  function suppress() {
    const parsed = suppressionRequestSchema.safeParse({
      chain,
      address,
      factorCode,
      publicReason,
      internalRationale,
    });
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setRequest({
      title: 'Suppress this indicator?',
      description: 'The indicator stops counting and the band is recomputed.',
      tone: 'danger',
      consequences: (
        <p>
          The public page shows that staff suppressed “{SUPPRESSIBLE_FACTOR_LABEL[parsed.data.factorCode]}”
          with this reason: <span className="font-medium text-text">{parsed.data.publicReason}</span>
        </p>
      ),
      parameters: () => [parsed.data],
      stepUp: { action: 'signal.suppress', targetId: 'new', description: 'suppress an indicator' },
      run: async () => {
        const result = await (await getAdminApi()).suppressSignal(parsed.data);
        if (result.kind === 'ok') {
          setAlert({
            kind: 'warning',
            title: 'Indicator suppressed',
            message: 'The public assessment was recomputed.',
          });
          setAddress('');
          setPublicReason('');
          setInternalRationale('');
          await reload();
        } else setAlert(moderationErrorAlert(result));
      },
    });
  }

  function lift(s: Suppression) {
    setRequest({
      title: 'Lift this suppression?',
      description: 'The indicator counts again and the band is recomputed.',
      reasonLabel: 'Internal reason (staff only)',
      parameters: (reason) => [s.id, reason],
      stepUp: { action: 'signal.suppression.lift', targetId: s.id, description: `lift suppression ${s.id}` },
      run: async (reason) => {
        const result = await (await getAdminApi()).liftSuppression(s.id, reason);
        setAlert(
          result.kind === 'ok'
            ? { kind: 'warning', title: 'Suppression lifted' }
            : moderationErrorAlert(result),
        );
        await reload();
      },
    });
  }

  if (load.kind === 'loading') return <LoadingStatus label="Loading suppressions…" />;
  if (load.kind === 'error') return <StaffLoadError onRetry={() => void reload()} />;
  if (load.kind === 'forbidden') return <AccessDenied detail={load.detail} />;

  return (
    <div className="flex flex-col gap-6">
      <FormAlert state={alert} />
      <DataCard
        title="Suppress an analysis indicator"
        description="For a false positive in an automated indicator. Findings are suspended or reversed through moderation, never suppressed."
      >
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            suppress();
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <Field id="sup-chain" label="Network">
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
          <Field id="sup-address" label="Address" error={errors['address']}>
            {(control) => (
              <Input
                {...control}
                value={address}
                spellCheck={false}
                onChange={(e) => setAddress(e.target.value)}
              />
            )}
          </Field>
          <div className="sm:col-span-2">
            <Field id="sup-factor" label="Indicator">
              {(control) => (
                <Select
                  {...control}
                  value={factorCode}
                  onChange={(e) => setFactorCode(e.target.value as SuppressibleFactorCode)}
                >
                  {SUPPRESSIBLE_FACTOR_CODES.map((c) => (
                    <option key={c} value={c}>
                      {SUPPRESSIBLE_FACTOR_LABEL[c]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Field
            id="sup-public"
            label="Public reason"
            hint="Shown on the public page."
            error={errors['publicReason']}
          >
            {(control) => (
              <Textarea
                {...control}
                rows={2}
                value={publicReason}
                onChange={(e) => setPublicReason(e.target.value)}
              />
            )}
          </Field>
          <Field
            id="sup-internal"
            label="Internal rationale"
            hint="Staff only."
            error={errors['internalRationale']}
          >
            {(control) => (
              <Textarea
                {...control}
                rows={2}
                value={internalRationale}
                onChange={(e) => setInternalRationale(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" variant="danger" className="w-fit">
            Review and suppress
          </Button>
        </form>
      </DataCard>
      {load.data.length === 0 ? (
        <p className="text-sm text-muted">No suppressions.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {load.data.map((s) => (
            <li
              key={s.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:justify-between"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-text">{SUPPRESSIBLE_FACTOR_LABEL[s.factorCode]}</span>
                  <Badge tone={s.liftedAt ? 'neutral' : 'warning'}>{s.liftedAt ? 'Lifted' : 'Active'}</Badge>
                </p>
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <ChainBadge chain={s.subject.chain} />
                  <span className="identifier" title={s.subject.address}>
                    {truncateMiddle(s.subject.displayAddress, 10, 8)}
                  </span>
                  <span>
                    by {s.createdBy.handle} on {formatDateUtc(s.createdAt)}
                  </span>
                </p>
                <p className="text-xs break-words text-muted">Public reason: {s.publicReason}</p>
                <p className="text-xs break-words text-muted">Internal rationale: {s.internalRationale}</p>
              </div>
              {s.liftedAt ? null : (
                <Button size="sm" variant="secondary" onClick={() => lift(s)}>
                  Lift<span className="sr-only"> suppression {s.id}</span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ProtectedAction request={request} onClose={close} verify={verifyAdminStepUp} />
    </div>
  );
}
