'use client';

import {
  findingSeveritySchema,
  revisionDraftSchema,
  type FindingHistory,
  type FindingRevision,
  type FindingSeverity,
  type RevisionDraft,
} from '@blacklist/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { FormAlert, type FormAlertState } from '@/components/auth/form-alert';
import { LoadingStatus } from '@/components/states/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getModerationApi } from '@/lib/api/browser';
import { formatDateTimeUtc } from '@/lib/format/date';
import { REVISION_STATUS_LABEL, SEVERITY_LABEL } from '@/lib/staff/copy';
import { moderationErrorAlert } from '@/lib/staff/errors';
import { AccessDenied, StaffLoadError } from './staff-states';

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'forbidden'; readonly detail: string }
  | { readonly kind: 'ready'; readonly history: FindingHistory };

type Errors = Partial<Record<keyof RevisionDraft, string>>;

const draftOf = (r: FindingRevision | undefined): RevisionDraft => ({
  severity: r?.severity ?? 'medium',
  publicSummary: r?.publicSummary ?? '',
  internalRationale: '',
});

/**
 * Revision history and editor for one finding (moderation §2, §8.1). Revisions are never
 * edited: a change proposes a new revision, based on the exact latest revision and hash
 * the editor saw. The public text changes only after that revision is approved.
 */
export function FindingRevisionEditor({ findingId }: { readonly findingId: string }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [draft, setDraft] = useState<RevisionDraft>(draftOf(undefined));
  const [errors, setErrors] = useState<Errors>({});
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const [stale, setStale] = useState(false);
  const [pending, setPending] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      const result = await (await getModerationApi()).getFindingHistory(findingId);
      if (result.kind === 'ok') {
        setLoad({ kind: 'ready', history: result.data });
        setDraft(draftOf(result.data.revisions[0]));
        setStale(false);
      } else if (result.code === 'forbidden') setLoad({ kind: 'forbidden', detail: result.detail });
      else if (result.code === 'not_found') setLoad({ kind: 'not_found' });
      else setLoad({ kind: 'error' });
    } catch {
      setLoad({ kind: 'error' });
    }
  }, [findingId]);

  useEffect(() => {
    // Initial fetch of external data: the effect subscribes to the API, as React intends.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchHistory();
  }, [fetchHistory]);

  if (load.kind === 'loading') return <LoadingStatus label="Loading revision history…" />;
  if (load.kind === 'error') return <StaffLoadError onRetry={() => void fetchHistory()} />;
  if (load.kind === 'forbidden') return <AccessDenied detail={load.detail} />;
  if (load.kind === 'not_found') {
    return (
      <div role="status" className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
        <p className="font-medium text-text">Finding not found</p>
        <p className="text-sm text-muted">
          It is not published, was reversed, or the link is wrong.{' '}
          <Link href="/mod/findings" className="font-medium text-accent hover:underline">
            Back to published findings
          </Link>
        </p>
      </div>
    );
  }

  const { finding, revisions, publicText, approvalBlockedReason } = load.history;
  const latest = revisions[0];
  const publicRevision = revisions.find((r) => r.status === 'published');
  const needsIndependent = draft.severity === 'severe' || publicRevision?.severity === 'severe';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!latest || pending) return;
    const parsed = revisionDraftSchema.safeParse(draft);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'publicSummary') next.publicSummary = 'Write a public summary of at least 10 characters.';
        if (key === 'internalRationale')
          next.internalRationale = 'Explain the change for staff in at least 10 characters.';
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const result = await (
        await getModerationApi()
      ).proposeRevision(
        findingId,
        { revisionNumber: latest.revisionNumber, contentHash: latest.contentHash },
        parsed.data,
      );
      if (result.kind === 'ok') {
        const created = result.data.revisions[0];
        setLoad({ kind: 'ready', history: result.data });
        setDraft(draftOf(created));
        setAlert({
          kind: 'warning',
          title: `Revision ${created?.revisionNumber ?? ''} proposed`,
          message:
            created?.status === 'pending_second_approval'
              ? 'It needs an independent approver before anything public changes.'
              : 'It is waiting for approval. Nothing public changes until it is approved.',
        });
      } else {
        if (result.code === 'conflict') setStale(true);
        setAlert(moderationErrorAlert(result));
      }
    } catch {
      setAlert({ kind: 'error', title: 'The revision was not saved', message: 'Try again in a moment.' });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="finding-heading" className="flex flex-col gap-2">
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="identifier">{finding.findingId}</span>
          <Badge tone={finding.severity === 'severe' || finding.severity === 'high' ? 'danger' : 'warning'}>
            {SEVERITY_LABEL[finding.severity]}
          </Badge>
          <Badge tone={finding.status === 'suspended' ? 'warning' : 'positive'}>
            {finding.status === 'suspended' ? 'Suspended' : 'Published'}
          </Badge>
        </p>
        <h2 id="finding-heading" className="text-lg font-semibold break-words text-text">
          {finding.title}
        </h2>
        <div className="rounded-md border border-border bg-surface p-3">
          <p className="text-xs font-medium text-muted">Current public text</p>
          <p className="text-sm break-words whitespace-pre-wrap text-text">{publicText ?? 'Not public.'}</p>
        </div>
        {approvalBlockedReason ? (
          <p role="note" className="text-sm font-medium text-warning">
            {approvalBlockedReason}{' '}
            {finding.reviewCaseId ? (
              <Link href={`/mod/cases/${finding.reviewCaseId}`} className="text-accent hover:underline">
                Open the suspension review
              </Link>
            ) : null}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="editor-heading" className="flex flex-col gap-3">
        <h2 id="editor-heading" className="text-base font-semibold text-text">
          Propose a new revision
        </h2>
        <FormAlert state={alert} />
        {stale ? (
          <Button variant="secondary" size="sm" className="self-start" onClick={() => void fetchHistory()}>
            Load the latest revision
          </Button>
        ) : null}
        {latest ? (
          <form
            noValidate
            onSubmit={(e) => void submit(e)}
            className="flex flex-col gap-4 rounded-md border border-border p-4"
          >
            <p className="text-sm text-muted">
              Based on revision {latest.revisionNumber} ·{' '}
              <span className="identifier break-all">{latest.contentHash}</span>. Saving creates revision{' '}
              {latest.revisionNumber + 1}; earlier revisions stay unchanged.
            </p>
            <Field id="revision-severity" label="Severity">
              {(control) => (
                <Select
                  {...control}
                  value={draft.severity}
                  onChange={(e) => setDraft({ ...draft, severity: e.target.value as FindingSeverity })}
                >
                  {findingSeveritySchema.options.map((s) => (
                    <option key={s} value={s}>
                      {SEVERITY_LABEL[s]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              id="revision-public"
              label="Public summary"
              hint="Shown on the public page only after this revision is approved. Factual language only."
              error={errors.publicSummary}
            >
              {(control) => (
                <Textarea
                  {...control}
                  value={draft.publicSummary}
                  onChange={(e) => setDraft({ ...draft, publicSummary: e.target.value })}
                />
              )}
            </Field>
            <Field
              id="revision-internal"
              label="Internal rationale (staff only)"
              hint="Why this change is needed. Never shown publicly."
              error={errors.internalRationale}
            >
              {(control) => (
                <Textarea
                  {...control}
                  value={draft.internalRationale}
                  onChange={(e) => setDraft({ ...draft, internalRationale: e.target.value })}
                />
              )}
            </Field>
            <p className="text-sm text-muted">
              {needsIndependent
                ? 'A severe revision, or one that replaces a severe public revision, needs an independent approver who authored no revision of this finding and took no part in the public revision.'
                : 'Approval follows the normal rules. You may approve a non-severe revision you wrote.'}
            </p>
            <Button type="submit" className="self-start" disabled={pending || stale}>
              {pending ? 'Saving…' : 'Propose revision'}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted">This finding has no stored revision to build on.</p>
        )}
      </section>

      <section aria-labelledby="history-heading" className="flex flex-col gap-3">
        <h2 id="history-heading" className="text-base font-semibold text-text">
          Revision history
        </h2>
        <p className="text-sm text-muted">Revisions are immutable. Newest first.</p>
        <ol className="flex flex-col gap-3">
          {revisions.map((r) => (
            <li key={r.revisionNumber}>
              <article
                aria-labelledby={`revision-${r.revisionNumber}`}
                className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4"
              >
                <h3
                  id={`revision-${r.revisionNumber}`}
                  className="flex flex-wrap items-center gap-2 text-sm font-medium text-text"
                >
                  Revision {r.revisionNumber}
                  <Badge tone={r.status === 'published' ? 'positive' : 'neutral'}>
                    {REVISION_STATUS_LABEL[r.status]}
                  </Badge>
                  <span className="text-xs font-normal text-muted">{SEVERITY_LABEL[r.severity]}</span>
                </h3>
                <p className="text-xs text-muted">
                  By {r.author.handle} · {formatDateTimeUtc(r.createdAt)}
                  {r.sourceCaseId ? ` · from case ${r.sourceCaseId}` : ''}
                </p>
                <p className="text-xs text-muted">
                  Hash <span className="identifier break-all">{r.contentHash}</span>
                </p>
                <p className="text-sm break-words whitespace-pre-wrap text-text">{r.publicSummary}</p>
                <p className="text-xs break-words text-muted">Internal: {r.internalRationale}</p>
              </article>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
