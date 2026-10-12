'use client';

import type { EvidenceFile, MemberSubmissionDetail, SubmitterReason } from '@blacklist/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { FormAlert, type FormAlertState } from '@/components/auth/form-alert';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { DataCard } from '@/components/app/data-card';
import { Notice } from '@/components/app/notice';
import { PageHeader } from '@/components/app/page-header';
import { LoadingStatus } from '@/components/states/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { getMemberApi } from '@/lib/api/browser';
import type { MemberResult } from '@/lib/api/types';
import { formatDateTimeUtc } from '@/lib/format/date';
import { KIND_LABEL, SUBMITTER_REASON_LABEL } from '@/lib/submissions/copy';
import { memberErrorAlert } from '@/lib/submissions/errors';
import { EvidenceUpload } from './evidence-upload';

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'problem'; readonly alert: FormAlertState }
  | { readonly kind: 'ready'; readonly detail: MemberSubmissionDetail };

/**
 * The member's own submission: status, member-visible history, information requests
 * and the reply form, withdrawal, and the outcome. Private to the member; never shows
 * staff identities or internal notes. Replies carry the version seen, so a change made
 * meanwhile is reported instead of being overwritten.
 */
export function SubmissionStatus({ id }: { readonly id: string }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState<string | undefined>(undefined);
  const [evidence, setEvidence] = useState<readonly EvidenceFile[]>([]);
  const [pending, setPending] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const inFlight = useRef(false);
  const onEvidence = useCallback((files: readonly EvidenceFile[]) => setEvidence(files), []);

  const fetchDetail = useCallback(async () => {
    try {
      const result = await (await getMemberApi()).getSubmission(id);
      setLoad(
        result.kind === 'ok'
          ? { kind: 'ready', detail: result.data }
          : { kind: 'problem', alert: memberErrorAlert(result) },
      );
    } catch {
      setLoad({
        kind: 'problem',
        alert: { kind: 'error', title: 'This submission couldn’t be loaded', message: 'Try again.' },
      });
    }
  }, [id]);

  useEffect(() => {
    // Initial fetch of external data: the effect subscribes to the API, as React intends.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchDetail();
  }, [fetchDetail]);

  async function apply(
    run: (version: number) => Promise<MemberResult<MemberSubmissionDetail>>,
  ): Promise<FormAlertState | null> {
    if (load.kind !== 'ready' || inFlight.current) return null;
    inFlight.current = true;
    try {
      const result = await run(load.detail.version);
      if (result.kind === 'ok') {
        setLoad({ kind: 'ready', detail: result.data });
        setAlert({ kind: 'none' });
        return null;
      }
      const next = memberErrorAlert(result);
      setAlert(next);
      return next;
    } catch {
      const next: FormAlertState = {
        kind: 'error',
        title: 'Something went wrong',
        message: 'Nothing was changed. Try again.',
      };
      setAlert(next);
      return next;
    } finally {
      inFlight.current = false;
    }
  }

  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (message.trim().length < 10) {
      setMessageError('Write at least 10 characters.');
      return;
    }
    setMessageError(undefined);
    setPending(true);
    const outcome = await apply(async (v) =>
      (await getMemberApi()).respond(id, v, { message, evidence: [...evidence] }),
    );
    if (outcome === null) setMessage('');
    setPending(false);
  }

  if (load.kind === 'loading') return <LoadingStatus label="Loading your submission…" />;
  if (load.kind === 'problem') {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert state={load.alert} />
        <Button variant="secondary" className="w-fit" onClick={() => void fetchDetail()}>
          Try again
        </Button>
      </div>
    );
  }
  const d = load.detail;
  const reason = d.submitterReason
    ? (SUBMITTER_REASON_LABEL[d.submitterReason as SubmitterReason] ?? null)
    : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            {KIND_LABEL[d.kind]} <span className="identifier">{d.id}</span>
          </span>
        }
        title={<span className="break-words">{d.title}</span>}
        description="Private: only you and Blacklist staff can see this."
        actions={<Badge tone={d.needsAction ? 'warning' : 'info'}>{d.status}</Badge>}
      />
      <FormAlert state={alert} />
      {alert.kind === 'warning' ? (
        <Button variant="secondary" className="w-fit" onClick={() => void fetchDetail()}>
          Load the latest status
        </Button>
      ) : null}

      {d.canRespond ? (
        <DataCard id="respond" title="Staff need more information">
          {d.infoRequest ? (
            <Notice tone="warning" title="Message from staff">
              {d.infoRequest}
            </Notice>
          ) : null}
          <form noValidate onSubmit={reply} className="mt-4 flex flex-col gap-4">
            <Field id="reply-message" label="Your reply" error={messageError}>
              {(control) => (
                <Textarea
                  {...control}
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              )}
            </Field>
            <EvidenceUpload label="Add images (optional)" onChange={onEvidence} />
            <Button type="submit" loading={pending} loadingLabel="Sending…" className="w-fit">
              Send reply
            </Button>
          </form>
        </DataCard>
      ) : null}

      {reason || d.publicOutcome || d.publicLink ? (
        <DataCard id="outcome" title="Outcome">
          <div className="flex flex-col gap-2 text-sm">
            {reason ? (
              <p>
                <span className="font-medium text-text">Reason (shown only to you):</span> {reason}
              </p>
            ) : null}
            {d.publicOutcome ? (
              <p>
                <span className="font-medium text-text">Published explanation:</span> {d.publicOutcome}
              </p>
            ) : null}
            {d.publicLink ? (
              <Link href={d.publicLink} className="w-fit font-medium text-accent hover:underline">
                See the public page
              </Link>
            ) : null}
          </div>
        </DataCard>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DataCard id="history" title="History">
          <ol className="flex flex-col gap-2 text-sm">
            {d.timeline.map((t, i) => (
              <li key={`${t.at}-${i}`} className="flex flex-wrap justify-between gap-2">
                <span className="text-text">{t.label}</span>
                <time className="text-xs text-muted" dateTime={t.at}>
                  {formatDateTimeUtc(t.at)}
                </time>
              </li>
            ))}
          </ol>
        </DataCard>
        <DataCard id="submitted" title="What you sent">
          <dl className="flex flex-col gap-3 text-sm">
            {d.details.map((item) => (
              <div key={item.label}>
                <dt className="text-xs font-medium text-muted">{item.label}</dt>
                <dd className="break-words whitespace-pre-wrap text-text">{item.value}</dd>
              </div>
            ))}
            <div>
              <dt className="text-xs font-medium text-muted">Images</dt>
              <dd className="break-all text-text">
                {d.evidenceNames.length > 0 ? d.evidenceNames.join(', ') : 'None'}
              </dd>
            </div>
          </dl>
        </DataCard>
      </div>

      {d.canWithdraw ? (
        <div>
          <Button variant="secondary" onClick={() => setWithdrawOpen(true)}>
            Withdraw
          </Button>
          <ConfirmDialog
            open={withdrawOpen}
            onOpenChange={setWithdrawOpen}
            title="Withdraw this submission?"
            description="Staff will stop reviewing it. You can submit again later with new information."
            confirmLabel="Withdraw"
            pendingLabel="Withdrawing…"
            tone="danger"
            onConfirm={() => apply(async (v) => (await getMemberApi()).withdraw(id, v))}
          />
        </div>
      ) : null}
    </div>
  );
}
