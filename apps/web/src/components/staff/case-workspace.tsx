'use client';

import type { CaseDecision, CaseDetail, StaffRole } from '@blacklist/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FormAlert, type FormAlertState } from '@/components/auth/form-alert';
import { ChainBadge } from '@/components/app/chain-badge';
import { CopyableValue } from '@/components/app/copyable-value';
import { DataCard } from '@/components/app/data-card';
import { Notice } from '@/components/app/notice';
import { PageHeader } from '@/components/app/page-header';
import { LoadingStatus } from '@/components/states/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { getModerationApi } from '@/lib/api/browser';
import type { ModerationResult, ProfileState } from '@/lib/api/types';
import { formatDateTimeUtc } from '@/lib/format/date';
import {
  CASE_TYPE_LABEL,
  CATEGORY_LABEL,
  MOCK_AUDIT_NOTICE,
  STATUS_LABEL,
  SUBMITTER_REASON_LABEL,
} from '@/lib/staff/copy';
import { moderationErrorAlert } from '@/lib/staff/errors';
import { AppealContext } from './appeal-context';
import { AssignmentControls } from './assignment-controls';
import { AuditTimeline } from './audit-timeline';
import { DecisionPanel } from './decision-panel';
import { EvidenceList } from './evidence-list';
import { InternalNotes } from './internal-notes';
import { ProfileDiff } from './profile-diff';
import { StaffAssessmentPanel } from './staff-assessment-panel';
import { AccessDenied, StaffLoadError } from './staff-states';

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'forbidden'; readonly detail: string }
  | { readonly kind: 'ready'; readonly detail: CaseDetail };

interface CaseWorkspaceProps {
  readonly caseId: string;
  readonly staffRole: StaffRole;
  readonly myHandle: string;
}

/**
 * Review workspace for one case. Every mutation sends the version this page saw; if
 * someone else changed the case, the service refuses with `conflict` and the page offers
 * to load the latest version without discarding what the reviewer typed.
 */
export function CaseWorkspace({ caseId, staffRole, myHandle }: CaseWorkspaceProps) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [alert, setAlert] = useState<FormAlertState>({ kind: 'none' });
  const [conflict, setConflict] = useState(false);
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const inFlight = useRef(false);

  const fetchCase = useCallback(async () => {
    try {
      const api = await getModerationApi();
      const result = await api.getCase(caseId);
      if (result.kind === 'ok') {
        setLoad({ kind: 'ready', detail: result.data });
        if (result.data.subject.kind === 'project') {
          const p = await api.getProfileState(result.data.subject.slug);
          setProfile(p.kind === 'ok' ? p.data : null);
        }
      } else if (result.code === 'not_found') setLoad({ kind: 'not_found' });
      else if (result.code === 'forbidden') setLoad({ kind: 'forbidden', detail: result.detail });
      else setLoad({ kind: 'error' });
    } catch {
      setLoad({ kind: 'error' });
    }
  }, [caseId]);

  useEffect(() => {
    // Initial fetch of external data: the effect subscribes to the API, as React intends.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchCase();
  }, [fetchCase]);

  /** Runs one mutation at a time and turns its result into page state. */
  async function mutate(
    run: (version: number) => Promise<ModerationResult<CaseDetail>>,
  ): Promise<FormAlertState | null> {
    if (load.kind !== 'ready') return null;
    if (inFlight.current) {
      return {
        kind: 'warning',
        title: 'Another action is still saving',
        message: 'Wait for it to finish, then try again.',
      };
    }
    inFlight.current = true;
    try {
      const result = await run(load.detail.version);
      if (result.kind === 'ok') {
        setLoad({ kind: 'ready', detail: result.data });
        setConflict(false);
        setAlert({ kind: 'none' });
        if (result.data.subject.kind === 'project') {
          const p = await (await getModerationApi()).getProfileState(result.data.subject.slug);
          setProfile(p.kind === 'ok' ? p.data : null);
        }
        return null;
      }
      const next = moderationErrorAlert(result);
      setConflict(result.code === 'conflict');
      setAlert(next);
      return next;
    } catch {
      const next: FormAlertState = {
        kind: 'error',
        title: 'Something went wrong',
        message: 'Nothing was changed.',
      };
      setAlert(next);
      return next;
    } finally {
      inFlight.current = false;
    }
  }

  if (load.kind === 'loading') return <LoadingStatus label="Loading the case…" />;
  if (load.kind === 'error') return <StaffLoadError onRetry={() => void fetchCase()} />;
  if (load.kind === 'forbidden') return <AccessDenied detail={load.detail} />;
  if (load.kind === 'not_found') {
    return <AccessDenied detail="This case does not exist or is outside your review scope." />;
  }

  const d = load.detail;
  const api = getModerationApi;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{CASE_TYPE_LABEL[d.type]}</Badge>
            <span className="identifier">{d.id}</span>
            <Badge tone="info">{STATUS_LABEL[d.status] ?? d.status}</Badge>
            {d.type === 'report_review' ? <span>{CATEGORY_LABEL[d.category]}</span> : null}
          </span>
        }
        title={d.title}
        actions={
          <AssignmentControls
            detail={d}
            staffRole={staffRole}
            myHandle={myHandle}
            onAssign={(to, takeOver) => mutate(async (v) => (await api()).assign(d.id, v, { to, takeOver }))}
          />
        }
      />

      <FormAlert state={alert} />
      {conflict ? (
        <Button
          variant="secondary"
          className="w-fit"
          onClick={() => void fetchCase().then(() => setConflict(false))}
        >
          Load the latest version
        </Button>
      ) : null}

      <DataCard id="subject" title="Subject">
        {d.subject.kind === 'address' ? (
          <div className="flex flex-col gap-2 text-sm">
            <span className="flex items-center gap-2">
              <ChainBadge chain={d.subject.chain} /> Address or contract
            </span>
            <CopyableValue value={d.subject.displayAddress} kind="address" full />
          </div>
        ) : (
          <p className="text-sm text-text">
            Project profile <span className="identifier">{d.subject.slug}</span> ({d.subject.name})
          </p>
        )}
        <p className="mt-2 text-xs text-muted">
          Submitted <time dateTime={d.submittedAt}>{formatDateTimeUtc(d.submittedAt)}</time> · Review due{' '}
          <time dateTime={d.slaDueAt}>{formatDateTimeUtc(d.slaDueAt)}</time> · Version {d.version}
        </p>
      </DataCard>

      {d.type === 'report_review' ? (
        <DataCard
          id="report"
          title={`Report from ${d.reporterRef}`}
          description="Private. Never published verbatim."
        >
          <p className="text-sm whitespace-pre-wrap text-text">{d.narrative}</p>
        </DataCard>
      ) : null}
      {d.type === 'appeal_review' ? (
        <DataCard id="appeal" title="Appeal">
          <AppealContext appeal={d} />
        </DataCard>
      ) : null}
      {d.type === 'correction_request' ? (
        <DataCard id="correction" title={`Proposed profile update from ${d.requesterRef}`}>
          <p className="mb-3 text-sm whitespace-pre-wrap text-text">{d.statement}</p>
          <ProfileDiff changes={d.changes} />
          {profile ? (
            <p className="mt-3 text-xs text-muted">
              Current public profile: revision {profile.revision}. Official domains:{' '}
              {profile.domains.length > 0 ? profile.domains.join(', ') : 'none'}.
            </p>
          ) : null}
        </DataCard>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <DataCard id="evidence" title={`Evidence (${d.evidence.length})`}>
          <EvidenceList evidence={d.evidence} />
        </DataCard>
        <DataCard id="staff-assessment" title="Assessment (staff view)">
          <StaffAssessmentPanel assessment={d.assessment} />
        </DataCard>
      </div>

      <DataCard id="decision" title="Decision">
        {d.publicSummary || d.submitterReason ? (
          <div className="mb-4 flex flex-col gap-2">
            {d.publicSummary ? (
              <Notice tone="info" title="Public explanation">
                {d.publicSummary}
              </Notice>
            ) : null}
            {d.submitterReason ? (
              <Notice tone="info" title="Shown to the submitter only">
                {SUBMITTER_REASON_LABEL[d.submitterReason as keyof typeof SUBMITTER_REASON_LABEL] ??
                  d.submitterReason}
              </Notice>
            ) : null}
          </div>
        ) : null}
        <DecisionPanel
          key={`${d.id}-${d.status}`}
          detail={d}
          staffRole={staffRole}
          verifyStepUp={async (action, target) => (await api()).verifyStepUp(action, target)}
          onDecide={(decision: CaseDecision) => mutate(async (v) => (await api()).decide(d.id, v, decision))}
        />
      </DataCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <DataCard id="notes" title="Internal notes" description="Staff only.">
          <InternalNotes
            notes={d.notes}
            onAdd={async (text) => (await mutate(async (v) => (await api()).addNote(d.id, v, text))) === null}
          />
        </DataCard>
        <DataCard id="case-history" title="Case history" description={MOCK_AUDIT_NOTICE}>
          <AuditTimeline entries={[...d.history].reverse()} />
        </DataCard>
      </div>

      <ButtonLink href="/mod" variant="ghost" className="w-fit">
        Back to the review dashboard
      </ButtonLink>
    </div>
  );
}
