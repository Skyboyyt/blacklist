'use client';

import type { FindingRevision } from '@blacklist/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FormAlert, type FormAlertState } from '@/components/auth/form-alert';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { StepUpDialog } from '@/components/security/step-up-dialog';
import { LoadingStatus } from '@/components/states/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { getModerationApi } from '@/lib/api/browser';
import { truncateMiddle } from '@/lib/format/address';
import { formatDateTimeUtc } from '@/lib/format/date';
import { REVISION_STATUS_LABEL, SEVERITY_LABEL } from '@/lib/staff/copy';
import { moderationErrorAlert } from '@/lib/staff/errors';
import { AccessDenied, StaffLoadError } from './staff-states';

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'forbidden'; readonly detail: string }
  | { readonly kind: 'ready'; readonly revisions: readonly FindingRevision[] };

type Pending = { readonly kind: 'approve' | 'reject'; readonly revision: FindingRevision } | null;

const STATUS = REVISION_STATUS_LABEL;

/**
 * Finding revisions awaiting approval (moderation §4). An approval names one exact
 * revision and content hash; publication is a system effect of that approval. Severe
 * revisions need an approver who authored no revision of the finding.
 */
export function ApprovalsView() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const [pending, setPending] = useState<Pending>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [rationale, setRationale] = useState('');
  const [rationaleError, setRationaleError] = useState<string | undefined>(undefined);
  const inFlight = useRef(false);

  const fetchRevisions = useCallback(async () => {
    try {
      const result = await (await getModerationApi()).listRevisions();
      if (result.kind === 'ok') setLoad({ kind: 'ready', revisions: result.data });
      else if (result.code === 'forbidden') setLoad({ kind: 'forbidden', detail: result.detail });
      else setLoad({ kind: 'error' });
    } catch {
      setLoad({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    // Initial fetch of external data: the effect subscribes to the API, as React intends.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchRevisions();
  }, [fetchRevisions]);

  async function submit() {
    if (!pending || inFlight.current) return;
    inFlight.current = true;
    const api = await getModerationApi();
    const { revision } = pending;
    const result =
      pending.kind === 'approve'
        ? await api.approveRevision(revision.findingId, revision.revisionNumber, revision.contentHash)
        : await api.rejectRevision(revision.findingId, revision.revisionNumber, rationale);
    inFlight.current = false;
    if (result.kind === 'ok') {
      setLoad({ kind: 'ready', revisions: result.data });
      setAlert({
        kind: 'warning',
        title: pending.kind === 'approve' ? 'Revision approved' : 'Revision rejected',
        message:
          pending.kind === 'approve'
            ? 'The approval was recorded and the system published this exact revision.'
            : 'Nothing was published.',
      });
      setRationale('');
    } else setAlert(moderationErrorAlert(result));
    setPending(null);
  }

  if (load.kind === 'loading') return <LoadingStatus label="Loading revisions…" />;
  if (load.kind === 'error') return <StaffLoadError onRetry={() => void fetchRevisions()} />;
  if (load.kind === 'forbidden') return <AccessDenied detail={load.detail} />;

  const waiting = load.revisions.filter(
    (r) => r.status === 'proposed' || r.status === 'pending_second_approval',
  );
  const other = load.revisions.filter((r) => !waiting.includes(r));

  const card = (r: FindingRevision) => (
    <li key={`${r.findingId}-${r.revisionNumber}`}>
      <article
        aria-labelledby={`rev-${r.findingId}-${r.revisionNumber}`}
        className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone={r.severity === 'severe' || r.severity === 'high' ? 'danger' : 'warning'}>
            {SEVERITY_LABEL[r.severity]}
          </Badge>
          <Badge tone="neutral">{STATUS[r.status]}</Badge>
          <span className="identifier text-muted">hash {r.contentHash}</span>
        </div>
        <h3 id={`rev-${r.findingId}-${r.revisionNumber}`} className="font-medium text-text">
          {r.findingId} · revision {r.revisionNumber}
        </h3>
        <p className="identifier text-sm text-muted">
          {r.subject.kind === 'address'
            ? `${r.subject.chain}: ${truncateMiddle(r.subject.displayAddress, 8, 6)}`
            : r.subject.name}
        </p>
        <p className="text-sm text-text">
          <span className="font-medium">Public if approved:</span> {r.publicSummary}
        </p>
        <p className="text-sm text-muted">
          <span className="font-medium text-text">Internal rationale (staff only):</span>{' '}
          {r.internalRationale}
        </p>
        <p className="text-xs text-muted">
          Author {r.author.handle} · <time dateTime={r.createdAt}>{formatDateTimeUtc(r.createdAt)}</time> ·
          Evidence: {r.evidenceIds.length > 0 ? r.evidenceIds.join(', ') : 'none'}
          {r.severity === 'severe'
            ? ' · Severe: the author and anyone who authored a revision cannot approve.'
            : ''}
        </p>
        {r.status !== 'published' && r.status !== 'rejected' ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                setPending({ kind: 'approve', revision: r });
                setConfirmOpen(true);
              }}
            >
              Approve this revision
            </Button>
            {r.isLatest ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setPending({ kind: 'reject', revision: r });
                  setConfirmOpen(true);
                }}
              >
                Reject
              </Button>
            ) : (
              <span className="text-xs text-muted">
                Outdated revision: the service refuses to approve it.
              </span>
            )}
          </div>
        ) : null}
      </article>
    </li>
  );

  return (
    <div className="flex flex-col gap-6">
      <FormAlert state={alert} />
      <section aria-labelledby="waiting-heading" className="flex flex-col gap-3">
        <h2 id="waiting-heading" className="text-lg font-semibold text-text">
          Awaiting approval ({waiting.length})
        </h2>
        {waiting.length === 0 ? (
          <p className="text-sm text-muted">Nothing is waiting for approval.</p>
        ) : (
          <ul className="flex flex-col gap-3">{waiting.map(card)}</ul>
        )}
      </section>
      <section aria-labelledby="other-heading" className="flex flex-col gap-3">
        <h2 id="other-heading" className="text-lg font-semibold text-text">
          Other revisions
        </h2>
        <ul className="flex flex-col gap-3">{other.map(card)}</ul>
      </section>
      {pending ? (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={pending.kind === 'approve' ? 'Approve this exact revision?' : 'Reject this revision?'}
          description={`${pending.revision.findingId}, revision ${pending.revision.revisionNumber} (hash ${pending.revision.contentHash}).`}
          tone={pending.kind === 'reject' ? 'danger' : 'default'}
          confirmLabel="Continue to security key"
          pendingLabel="Checking…"
          consequences={
            pending.kind === 'approve' ? (
              <p>
                Approval publishes exactly this revision as a system effect. Any later change needs a new
                revision and a new approval.
              </p>
            ) : (
              <Field id="reject-rationale" label="Rationale (staff only)" error={rationaleError}>
                {(control) => (
                  <Textarea {...control} value={rationale} onChange={(e) => setRationale(e.target.value)} />
                )}
              </Field>
            )
          }
          onConfirm={async () => {
            if (pending.kind === 'reject' && rationale.trim().length < 10) {
              setRationaleError('Write at least 10 characters.');
              return { kind: 'error', title: 'A rationale is required' };
            }
            setRationaleError(undefined);
            setStepUpOpen(true);
            return null;
          }}
        />
      ) : null}
      {pending ? (
        <StepUpDialog
          open={stepUpOpen}
          onOpenChange={setStepUpOpen}
          actionDescription={`${pending.kind} ${pending.revision.findingId} revision ${pending.revision.revisionNumber}`}
          action={pending.kind === 'approve' ? 'finding.approve' : 'finding.reject'}
          targetId={pending.revision.findingId}
          parameters={
            pending.kind === 'approve'
              ? [pending.revision.findingId, pending.revision.revisionNumber, pending.revision.contentHash]
              : [pending.revision.findingId, pending.revision.revisionNumber, rationale.trim()]
          }
          verify={async (action, target, parameters) =>
            (await getModerationApi()).verifyStepUp(action, target, parameters)
          }
          onVerified={() => void submit()}
        />
      ) : null}
    </div>
  );
}
