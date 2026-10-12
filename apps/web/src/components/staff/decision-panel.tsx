'use client';

import {
  caseDecisionSchema,
  findingSeveritySchema,
  SUBMITTER_REASONS,
  type CaseDecision,
  type CaseDetail,
  type FindingSeverity,
  type PasskeyResult,
  type StaffRole,
  type SubmitterReason,
} from '@blacklist/contracts';
import { useState, type FormEvent } from 'react';
import type { FormAlertState } from '@/components/auth/form-alert';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { StepUpDialog } from '@/components/security/step-up-dialog';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DECISION_COPY, SEVERITY_LABEL, SUBMITTER_REASON_LABEL } from '@/lib/staff/copy';
import { decisionsFor, roleLimitFor, STEP_UP_DECISIONS } from '@/lib/staff/workflow';
import { ProfileDiff } from './profile-diff';

type Action = CaseDecision['action'];

interface Fields {
  severity: FindingSeverity;
  publicSummary: string;
  internalRationale: string;
  reason: SubmitterReason;
  messageToSubmitter: string;
}

const EMPTY: Fields = {
  severity: 'medium',
  publicSummary: '',
  internalRationale: '',
  reason: 'insufficient_evidence',
  messageToSubmitter: '',
};

function build(action: Action, f: Fields): unknown {
  switch (action) {
    case 'start_review':
      return { action };
    case 'request_info':
      return { action, messageToSubmitter: f.messageToSubmitter };
    case 'accept_report':
      return {
        action,
        severity: f.severity,
        publicSummary: f.publicSummary,
        internalRationale: f.internalRationale,
      };
    case 'reject_report':
    case 'reject_correction':
      return { action, reason: f.reason, internalRationale: f.internalRationale };
    case 'reject_abusive':
      return { action, internalRationale: f.internalRationale };
    case 'uphold':
    case 'amend':
    case 'reverse':
    case 'accept_correction':
      return { action, publicSummary: f.publicSummary, internalRationale: f.internalRationale };
  }
}

const needs = {
  publicSummary: (a: Action) =>
    ['accept_report', 'uphold', 'amend', 'reverse', 'accept_correction'].includes(a),
  rationale: (a: Action) => a !== 'start_review' && a !== 'request_info',
  reason: (a: Action) => a === 'reject_report' || a === 'reject_correction',
};

interface DecisionPanelProps {
  readonly detail: CaseDetail;
  readonly staffRole: StaffRole;
  readonly onDecide: (decision: CaseDecision) => Promise<FormAlertState | null>;
  readonly verifyStepUp: (action: string, targetId: string) => Promise<PasskeyResult>;
}

/**
 * Decisions available for this case's type and status. Consequential decisions go through
 * a confirmation screen and then an action-bound passkey step-up. Public text and the
 * internal rationale are separate fields and are labelled as such.
 */
export function DecisionPanel({ detail, staffRole, onDecide, verifyStepUp }: DecisionPanelProps) {
  const actions = decisionsFor(detail.type, detail.status);
  const [selected, setSelected] = useState<Action | null>(null);
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [decision, setDecision] = useState<CaseDecision | null>(null);
  const [startPending, setStartPending] = useState(false);

  if (actions.length === 0) {
    return <p className="text-sm text-muted">No staff decision is available in this status.</p>;
  }

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const parsed = caseDecisionSchema.safeParse(build(selected, fields));
    if (!parsed.success) {
      const next: Partial<Record<keyof Fields, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string' && key in EMPTY) next[key as keyof Fields] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setDecision(parsed.data);
    setConfirmOpen(true);
  }

  async function finish(d: CaseDecision): Promise<FormAlertState | null> {
    const alert = await onDecide(d);
    if (!alert) {
      setSelected(null);
      setFields(EMPTY);
      setDecision(null);
    }
    return alert;
  }

  async function startReview() {
    if (startPending) return;
    setStartPending(true);
    await onDecide({ action: 'start_review' });
    setStartPending(false);
  }

  const copy = selected ? DECISION_COPY[selected] : null;
  const limit = selected ? roleLimitFor(staffRole, selected) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Available decisions">
        {actions.map((a) =>
          a === 'start_review' ? (
            <Button key={a} onClick={startReview} loading={startPending} loadingLabel="Starting…">
              {DECISION_COPY[a].label}
            </Button>
          ) : (
            <Button
              key={a}
              variant={selected === a ? 'primary' : 'secondary'}
              aria-pressed={selected === a}
              onClick={() => {
                setSelected(a);
                setErrors({});
              }}
            >
              {DECISION_COPY[a].label}
            </Button>
          ),
        )}
      </div>

      {selected && copy ? (
        <form
          noValidate
          onSubmit={prepare}
          className="flex flex-col gap-4 rounded-md border border-border p-4"
        >
          <p className="text-sm text-muted">{copy.consequence}</p>
          {limit ? <p className="text-sm font-medium text-warning">{limit}</p> : null}
          {selected === 'accept_report' ? (
            <Field id="decision-severity" label="Finding severity">
              {(control) => (
                <Select
                  {...control}
                  value={fields.severity}
                  onChange={(e) => setFields({ ...fields, severity: e.target.value as FindingSeverity })}
                >
                  {findingSeveritySchema.options.map((s) => (
                    <option key={s} value={s}>
                      {SEVERITY_LABEL[s]}
                      {s === 'severe' ? ' (needs an independent approver)' : ''}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}
          {selected === 'request_info' ? (
            <Field
              id="decision-message"
              label="Message to the reporter"
              hint="The reporter sees this message."
              error={errors.messageToSubmitter}
            >
              {(control) => (
                <Textarea
                  {...control}
                  value={fields.messageToSubmitter}
                  onChange={(e) => setFields({ ...fields, messageToSubmitter: e.target.value })}
                />
              )}
            </Field>
          ) : null}
          {needs.publicSummary(selected) ? (
            <Field
              id="decision-public"
              label="Public explanation"
              hint="Published with the outcome. Factual language only; no reporter details."
              error={errors.publicSummary}
            >
              {(control) => (
                <Textarea
                  {...control}
                  value={fields.publicSummary}
                  onChange={(e) => setFields({ ...fields, publicSummary: e.target.value })}
                />
              )}
            </Field>
          ) : null}
          {needs.reason(selected) ? (
            <Field
              id="decision-reason"
              label="Reason shown to the submitter"
              hint="Shown to the submitter only, never on a public page."
            >
              {(control) => (
                <Select
                  {...control}
                  value={fields.reason}
                  onChange={(e) => setFields({ ...fields, reason: e.target.value as SubmitterReason })}
                >
                  {SUBMITTER_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {SUBMITTER_REASON_LABEL[r]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}
          {needs.rationale(selected) ? (
            <Field
              id="decision-internal"
              label="Internal rationale"
              hint="Staff only. Recorded in the audit history; never published."
              error={errors.internalRationale}
            >
              {(control) => (
                <Textarea
                  {...control}
                  value={fields.internalRationale}
                  onChange={(e) => setFields({ ...fields, internalRationale: e.target.value })}
                />
              )}
            </Field>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant={copy.tone === 'danger' ? 'danger' : 'primary'}>
              Review and confirm
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSelected(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {decision ? (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`${DECISION_COPY[decision.action].label}?`}
          description={`Case ${detail.id}. Check what will happen before you confirm.`}
          tone={DECISION_COPY[decision.action].tone}
          confirmLabel={STEP_UP_DECISIONS.has(decision.action) ? 'Continue to security key' : 'Confirm'}
          pendingLabel="Saving…"
          consequences={
            <div className="flex flex-col gap-2">
              <p>{DECISION_COPY[decision.action].consequence}</p>
              {'publicSummary' in decision ? (
                <p>
                  <span className="font-medium text-text">Public explanation:</span> {decision.publicSummary}
                </p>
              ) : null}
              {'reason' in decision ? (
                <p>
                  <span className="font-medium text-text">Submitter sees:</span>{' '}
                  {SUBMITTER_REASON_LABEL[decision.reason]}
                </p>
              ) : null}
              {'internalRationale' in decision ? (
                <p>
                  <span className="font-medium text-text">Internal rationale (staff only):</span>{' '}
                  {decision.internalRationale}
                </p>
              ) : null}
              {decision.action === 'accept_correction' && detail.type === 'correction_request' ? (
                <ProfileDiff changes={detail.changes} />
              ) : null}
            </div>
          }
          onConfirm={async () => {
            if (STEP_UP_DECISIONS.has(decision.action)) {
              setStepUpOpen(true);
              return null;
            }
            return finish(decision);
          }}
        />
      ) : null}

      {decision ? (
        <StepUpDialog
          open={stepUpOpen}
          onOpenChange={setStepUpOpen}
          actionDescription={DECISION_COPY[decision.action].label.toLowerCase()}
          action={`case.${decision.action}`}
          targetId={detail.id}
          verify={verifyStepUp}
          onVerified={() => {
            void finish(decision);
          }}
        />
      ) : null}
    </div>
  );
}
