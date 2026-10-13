'use client';

import type { StaffFinding } from '@blacklist/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { FormAlert, type FormAlertState } from '@/components/auth/form-alert';
import { ChainBadge } from '@/components/app/chain-badge';
import { LoadingStatus } from '@/components/states/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getModerationApi } from '@/lib/api/browser';
import { truncateMiddle } from '@/lib/format/address';
import { formatDateUtc } from '@/lib/format/date';
import { SEVERITY_LABEL } from '@/lib/staff/copy';
import { moderationErrorAlert } from '@/lib/staff/errors';
import { ProtectedAction, useProtectedAction } from './protected-action';
import { AccessDenied, StaffLoadError } from './staff-states';

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'forbidden'; readonly detail: string }
  | { readonly kind: 'ready'; readonly findings: readonly StaffFinding[] };

/**
 * Published findings with emergency suspension (moderation §8.3). Any moderator or
 * administrator with a security-key step-up can suspend at once; a non-participant then
 * reinstates or reverses within 72 hours. Suspending a severe finding alerts every admin.
 */
export function FindingsView() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const { request, start: setRequest, close } = useProtectedAction();

  const fetchFindings = useCallback(async () => {
    try {
      const result = await (await getModerationApi()).listFindings();
      if (result.kind === 'ok') setLoad({ kind: 'ready', findings: result.data });
      else if (result.code === 'forbidden') setLoad({ kind: 'forbidden', detail: result.detail });
      else setLoad({ kind: 'error' });
    } catch {
      setLoad({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    // Initial fetch of external data: the effect subscribes to the API, as React intends.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchFindings();
  }, [fetchFindings]);

  function suspend(f: StaffFinding) {
    setRequest({
      title: `Suspend ${f.findingId}?`,
      description: 'Emergency suspension takes effect immediately.',
      tone: 'danger',
      consequences: (
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            The public page shows only “Temporarily suspended pending review”, and the finding stops counting.
          </li>
          <li>
            A suspension review opens; someone who did not take part in the finding must decide within 72
            hours.
          </li>
          {f.severity === 'severe' ? (
            <li>This is a severe finding: every administrator is alerted.</li>
          ) : null}
          <li>
            Examples of valid reasons: personal data published by mistake, the wrong subject, credible
            counter-evidence.
          </li>
        </ul>
      ),
      reasonLabel: 'Internal reason (staff only)',
      parameters: (reason) => [f.findingId, reason],
      stepUp: {
        action: 'finding.suspend',
        targetId: f.findingId,
        description: `suspend finding ${f.findingId}`,
      },
      run: async (reason) => {
        const result = await (await getModerationApi()).suspendFinding(f.findingId, reason);
        if (result.kind === 'ok') {
          setAlert({
            kind: 'warning',
            title: 'Finding suspended',
            message: `Review case ${result.data.id} is open. It must be decided within 72 hours.`,
          });
          await fetchFindings();
        } else setAlert(moderationErrorAlert(result));
      },
    });
  }

  if (load.kind === 'loading') return <LoadingStatus label="Loading findings…" />;
  if (load.kind === 'error') return <StaffLoadError onRetry={() => void fetchFindings()} />;
  if (load.kind === 'forbidden') return <AccessDenied detail={load.detail} />;

  return (
    <div className="flex flex-col gap-4">
      <FormAlert state={alert} />
      {load.findings.length === 0 ? (
        <p className="text-sm text-muted">No published findings.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {load.findings.map((f) => (
            <li key={f.findingId}>
              <article
                aria-labelledby={`finding-${f.findingId}`}
                className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="identifier">{f.findingId}</span>
                    <Badge tone={f.severity === 'severe' || f.severity === 'high' ? 'danger' : 'warning'}>
                      {SEVERITY_LABEL[f.severity]}
                    </Badge>
                    <Badge tone={f.status === 'suspended' ? 'warning' : 'positive'}>
                      {f.status === 'suspended' ? 'Suspended' : 'Published'}
                    </Badge>
                  </p>
                  <h3 id={`finding-${f.findingId}`} className="font-medium break-words text-text">
                    {f.title}
                  </h3>
                  {f.subject.kind === 'address' ? (
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <ChainBadge chain={f.subject.chain} />
                      <span className="identifier" title={f.subject.address}>
                        {truncateMiddle(f.subject.displayAddress, 10, 8)}
                      </span>
                    </p>
                  ) : null}
                  <p className="text-xs text-muted">
                    Author {f.author.handle} · approved by {f.approver.handle} · published{' '}
                    {formatDateUtc(f.publishedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  <Link
                    href={`/mod/findings/${encodeURIComponent(f.findingId)}`}
                    className="text-sm font-medium text-accent hover:underline"
                  >
                    Revisions<span className="sr-only"> of {f.findingId}</span>
                  </Link>
                  {f.status === 'published' ? (
                    <Button size="sm" variant="danger" onClick={() => suspend(f)}>
                      Suspend<span className="sr-only"> {f.findingId}</span>
                    </Button>
                  ) : f.reviewCaseId ? (
                    <Link
                      href={`/mod/cases/${f.reviewCaseId}`}
                      className="text-sm font-medium text-accent hover:underline"
                    >
                      Open suspension review
                    </Link>
                  ) : (
                    <span className="text-xs text-muted">Suspended before this demo started</span>
                  )}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
      <ProtectedAction
        request={request}
        onClose={close}
        verify={async (action, target, parameters) =>
          (await getModerationApi()).verifyStepUp(action, target, parameters)
        }
      />
    </div>
  );
}
