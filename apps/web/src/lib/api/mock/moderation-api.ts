/**
 * Mock staff review service (development and tests only; never in production builds).
 *
 * It enforces, by itself, what the UI also shows, so a hidden button is never the only
 * guard. Every call is checked, in order:
 * 1. caller is staff (otherwise `forbidden`);
 * 2. the case is in the caller's scope (appeal reviewers see appeals only; otherwise
 *    `not_found`, as the API does for inaccessible private resources);
 * 3. role permission (ARCHITECTURE §9.2);
 * 4. optimistic version (`conflict`, nothing overwritten);
 * 5. allowed transition for the case type and status (moderation §9–§10; ADR 0010);
 * 6. assignment (only the assigned reviewer decides);
 * 7. independence (moderation §4.1, §7, §9);
 * 8. a fresh, single-use, action-bound step-up for consequential decisions.
 * State lives in the shared demo store (store.ts). The audit trail is MOCK history only.
 */
import {
  caseDecisionSchema,
  revisionBaseSchema,
  revisionDraftSchema,
  type FindingHistory,
  type FindingRevision,
  type RevisionDraft,
  findingSeveritySchema,
  QUEUE_PAGE_SIZE,
  suspensionRequestSchema,
  type StaffFinding,
  type AuditEntry,
  type CaseDecision,
  type CaseDetail,
  type CaseSummary,
  type PasskeyResult,
  type QueueQuery,
  type StaffRef,
  type StaffRole,
} from '@blacklist/contracts';
import { hasPermission, type StaffPermission } from '@/lib/staff/permissions';
import type { ModerationApi, ModerationResult } from '../types';
import { CONFLICT_CASE_ID, QUEUE_ERROR_QUERY, STAFF } from './fixtures/moderation';
import {
  applyAppealOutcome,
  applyProjectCorrection,
  createProjectFromSuggestion,
  publishFinding,
  publishResponse,
  reinstateFinding,
  reverseSuspendedFinding,
  suspendFinding,
} from './public-effects';
import { currentPasskeyResult, currentScenario, currentViewerKey, type MockViewerKey } from './scenario';
import { staffAssessmentFor } from './staff-scoring';
import { consumeGrant as consumeBoundGrant, issueGrant } from './step-up';
import { participantIds } from './finding-participants';
import { addRecoveryVerification } from './recovery';
import { revisionHash } from './revision-hash';
import { createStore, nextId, type MockStore } from './store';

export interface MockModerationOptions {
  readonly cookies: () => string;
  readonly now?: () => Date;
  readonly latencyMs?: number;
  /** Shared demo store; a fresh one from the fixtures when omitted (unit tests). */
  readonly store?: MockStore;
}

const STEP_UP_TTL_MS = 5 * 60 * 1000;
const OPEN_STATUSES: Readonly<Record<CaseDetail['type'], readonly string[]>> = {
  report_review: ['submitted', 'screening', 'queued', 'in_review', 'needs_info'],
  appeal_review: ['submitted', 'in_review'],
  correction_request: ['submitted', 'in_review'],
  project_suggestion: ['submitted', 'needs_information'],
  subject_response: ['submitted', 'in_review'],
  suspension_review: ['open'],
};

const IDENTITIES: Partial<Record<MockViewerKey, { ref: StaffRef; role: StaffRole }>> = {
  moderator: { ref: STAFF.moderatorA, role: 'moderator' },
  moderator_b: { ref: STAFF.moderatorB, role: 'moderator' },
  appeal_reviewer: { ref: STAFF.appealReviewer, role: 'appeal_reviewer' },
  admin: { ref: STAFF.admin, role: 'admin' },
  admin_b: { ref: STAFF.adminB, role: 'admin' },
};

interface Rule {
  readonly type: CaseDetail['type'];
  readonly from: readonly string[];
  /** `null` keeps the status (standing decisions). */
  readonly to: string | null;
  readonly permission: StaffPermission;
  readonly stepUp: boolean;
}

/** Rules per decision: case type, allowed statuses, resulting status, permission, step-up. */
const TRANSITIONS: Readonly<Record<CaseDecision['action'], readonly Rule[]>> = {
  start_review: [
    {
      type: 'report_review',
      from: ['queued'],
      to: 'in_review',
      permission: 'finding:propose',
      stepUp: false,
    },
    {
      type: 'appeal_review',
      from: ['submitted'],
      to: 'in_review',
      permission: 'appeal:decide',
      stepUp: false,
    },
    {
      type: 'correction_request',
      from: ['submitted'],
      to: 'in_review',
      permission: 'correction:decide',
      stepUp: false,
    },
    {
      type: 'subject_response',
      from: ['submitted'],
      to: 'in_review',
      permission: 'response:moderate',
      stepUp: false,
    },
  ],
  request_info: [
    {
      type: 'report_review',
      from: ['in_review'],
      to: 'needs_info',
      permission: 'finding:propose',
      stepUp: false,
    },
    {
      type: 'project_suggestion',
      from: ['submitted'],
      to: 'needs_information',
      permission: 'correction:decide',
      stepUp: false,
    },
  ],
  accept_report: [
    {
      type: 'report_review',
      from: ['in_review'],
      to: 'accepted',
      permission: 'finding:propose',
      stepUp: true,
    },
  ],
  reject_report: [
    {
      type: 'report_review',
      from: ['in_review'],
      to: 'rejected',
      permission: 'finding:propose',
      stepUp: true,
    },
  ],
  reject_abusive: [
    {
      type: 'report_review',
      from: ['in_review'],
      to: 'rejected_abusive',
      permission: 'finding:propose',
      stepUp: true,
    },
  ],
  uphold: [
    { type: 'appeal_review', from: ['in_review'], to: 'upheld', permission: 'appeal:decide', stepUp: true },
  ],
  amend: [
    { type: 'appeal_review', from: ['in_review'], to: 'amended', permission: 'appeal:decide', stepUp: true },
  ],
  reverse: [
    { type: 'appeal_review', from: ['in_review'], to: 'reversed', permission: 'appeal:decide', stepUp: true },
  ],
  accept_correction: [
    {
      type: 'correction_request',
      from: ['in_review'],
      to: 'accepted',
      permission: 'correction:decide',
      stepUp: true,
    },
  ],
  reject_correction: [
    {
      type: 'correction_request',
      from: ['in_review'],
      to: 'rejected',
      permission: 'correction:decide',
      stepUp: true,
    },
  ],
  accept_suggestion: [
    {
      type: 'project_suggestion',
      from: ['submitted'],
      to: 'accepted_into_profile',
      permission: 'project:manage',
      stepUp: true,
    },
  ],
  reject_suggestion: [
    {
      type: 'project_suggestion',
      from: ['submitted'],
      to: 'not_accepted',
      permission: 'correction:decide',
      stepUp: true,
    },
  ],
  grant_standing: [
    {
      type: 'appeal_review',
      from: ['in_review'],
      to: null,
      permission: 'standing:decide',
      stepUp: false,
    },
    {
      type: 'subject_response',
      from: ['in_review'],
      to: null,
      permission: 'standing:decide',
      stepUp: false,
    },
  ],
  deny_standing: [
    {
      type: 'appeal_review',
      from: ['in_review'],
      to: null,
      permission: 'standing:decide',
      stepUp: false,
    },
    {
      type: 'subject_response',
      from: ['in_review'],
      to: null,
      permission: 'standing:decide',
      stepUp: false,
    },
  ],
  publish_response: [
    {
      type: 'subject_response',
      from: ['in_review'],
      to: 'published',
      permission: 'response:moderate',
      stepUp: true,
    },
  ],
  reject_response: [
    {
      type: 'subject_response',
      from: ['in_review'],
      to: 'rejected',
      permission: 'response:moderate',
      stepUp: true,
    },
  ],
  reinstate_finding: [
    {
      type: 'suspension_review',
      from: ['open'],
      to: 'reinstated',
      permission: 'finding:publish',
      stepUp: true,
    },
  ],
  reverse_finding: [
    {
      type: 'suspension_review',
      from: ['open'],
      to: 'reversed',
      permission: 'finding:publish',
      stepUp: true,
    },
  ],
};

/** The step-up action name a decision is bound to (identity §10.7). */
export function stepUpActionFor(decision: CaseDecision['action']): string {
  return `case.${decision}`;
}

const clone = <T>(value: T): T => structuredClone(value);
const ok = <T>(data: T): ModerationResult<T> => ({ kind: 'ok', data });

export function createMockModerationApi(options: MockModerationOptions): ModerationApi {
  const now = options.now ?? (() => new Date());
  const latency = options.latencyMs ?? 300;
  const wait = () => (latency > 0 ? new Promise<void>((r) => setTimeout(r, latency)) : Promise.resolve());
  const store = options.store ?? createStore();

  /**
   * The caller's staff identity. The account must still be active and hold the role in
   * the demo store, so a suspension, offboarding or role removal takes effect at once.
   */
  const identity = () => {
    const who = IDENTITIES[currentViewerKey(options.cookies())];
    if (!who || currentScenario(options.cookies()) === 'session_expired') return null;
    const member = store.staff.find((m) => m.id === who.ref.id);
    return member?.status === 'active' && member.roles.includes(who.role) ? who : null;
  };
  const at = () => now().toISOString();

  function err<T>(
    code: 'forbidden' | 'invalid_transition' | 'not_eligible' | 'evidence_unavailable',
    detail: string,
  ): ModerationResult<T> {
    return { kind: 'error', code, detail };
  }

  function record(entry: Omit<AuditEntry, 'id' | 'at'>): void {
    store.seq += 1;
    store.audit.push({ id: `audit-${store.seq}`, at: at(), ...entry });
  }

  function notifyOwner(c: CaseDetail, text: string): void {
    const handle = store.owners.get(c.id);
    if (!handle) return;
    store.seq += 1;
    const href =
      c.type === 'report_review'
        ? `/reports/${c.id}`
        : c.type === 'project_suggestion'
          ? `/projects/suggestions/${c.id}`
          : c.type === 'appeal_review'
            ? `/appeals/${c.id}`
            : c.type === 'subject_response'
              ? `/responses/${c.id}`
              : `/corrections/${c.id}`;
    store.notices.unshift({ handle, id: `notice-${store.seq}`, text, at: at(), href });
  }

  function inScope(role: StaffRole, c: CaseDetail): boolean {
    return role !== 'appeal_reviewer' || c.type === 'appeal_review';
  }

  const isOpen = (c: CaseDetail) => OPEN_STATUSES[c.type].includes(c.status);

  function view(c: CaseDetail): CaseDetail {
    const detail = clone(c);
    detail.history = store.audit.filter((e) => e.caseId === c.id).sort((a, b) => a.at.localeCompare(b.at));
    if (c.subject.kind === 'address') {
      const subject = c.subject;
      const r = store.addresses.find((a) => a.chain === subject.chain && a.address === subject.address);
      detail.assessment = r ? staffAssessmentFor(r) : null;
    } else {
      detail.assessment = null;
    }
    return detail;
  }

  function summary(c: CaseDetail): CaseSummary {
    const common = {
      id: c.id,
      subject: c.subject,
      chain: c.chain,
      title: c.title,
      assignedTo: c.assignedTo,
      submittedAt: c.submittedAt,
      lastActivityAt: c.lastActivityAt,
      slaDueAt: c.slaDueAt,
      version: c.version,
    };
    switch (c.type) {
      case 'report_review':
        return { ...common, type: c.type, status: c.status, category: c.category };
      case 'appeal_review':
        return { ...common, type: c.type, status: c.status };
      case 'correction_request':
        return { ...common, type: c.type, status: c.status };
      case 'project_suggestion':
        return { ...common, type: c.type, status: c.status };
      case 'subject_response':
        return { ...common, type: c.type, status: c.status };
      case 'suspension_review':
        return { ...common, type: c.type, status: c.status };
    }
  }

  function touch(c: CaseDetail): void {
    c.version += 1;
    c.lastActivityAt = at();
  }

  /** Shared guard for case mutations: staff, scope, version, and the one-time simulated concurrent edit. */
  function guardMutation(
    caseId: string,
    expectedVersion: number,
  ):
    | { ok: true; c: CaseDetail; me: StaffRef; role: StaffRole }
    | { ok: false; result: ModerationResult<CaseDetail> } {
    const who = identity();
    if (!who) return { ok: false, result: err('forbidden', 'Staff access is required.') };
    const c = store.cases.get(caseId);
    if (!c || !inScope(who.role, c)) return { ok: false, result: { kind: 'error', code: 'not_found' } };
    if (caseId === CONFLICT_CASE_ID && store.conflictPending) {
      store.conflictPending = false;
      const other = who.ref.id === STAFF.moderatorB.id ? STAFF.moderatorA : STAFF.moderatorB;
      touch(c);
      c.notes.push({
        id: `note-${c.id}-concurrent`,
        author: other,
        at: at(),
        text: 'Added evidence context while you had this case open.',
      });
      record({ actor: other, action: 'case_note_added', caseId, reason: null, changes: [] });
    }
    if (c.version !== expectedVersion) {
      return {
        ok: false,
        result: {
          kind: 'error',
          code: 'conflict',
          detail:
            'Someone else changed this case after you opened it. Nothing was applied. Review the latest version.',
          currentVersion: c.version,
        },
      };
    }
    return { ok: true, c, me: who.ref, role: who.role };
  }

  function consumeGrant(action: string, targetId: string, parameters: readonly unknown[]): boolean {
    const who = identity();
    return (
      who !== null &&
      consumeBoundGrant(store, who.ref.id, options.cookies(), action, targetId, parameters, now().getTime())
    );
  }

  function createRevision(
    c: CaseDetail,
    me: StaffRef,
    d: Extract<CaseDecision, { action: 'accept_report' }>,
  ): void {
    const findingId = `demo-finding-${600 + store.revisions.filter((r) => r.revisionNumber === 1).length}`;
    appendRevision(findingId, c.subject, me, d, {
      evidenceIds: c.evidence.filter((e) => e.state === 'available').map((e) => e.id),
      sourceCaseId: c.id,
    });
  }

  /** Severity of the finding's currently public revision, if it has one. */
  function publicSeverity(findingId: string): string | undefined {
    return (
      store.revisions.find((r) => r.findingId === findingId && r.status === 'published')?.severity ??
      store.findingParticipants.get(findingId)?.severity
    );
  }

  /**
   * Append a new immutable revision (moderation §2). An earlier revision that was still
   * waiting for approval is superseded: an approval only authorizes the latest revision.
   * The public revision stays public until the new one is approved (§8.1).
   */
  function appendRevision(
    findingId: string,
    subject: CaseDetail['subject'],
    me: StaffRef,
    draft: RevisionDraft,
    source: { readonly evidenceIds: readonly string[]; readonly sourceCaseId: string | null },
  ): FindingRevision {
    const revisionNumber =
      Math.max(0, ...store.revisions.filter((r) => r.findingId === findingId).map((r) => r.revisionNumber)) +
      1;
    for (const r of store.revisions) {
      if (r.findingId !== findingId) continue;
      r.isLatest = false;
      if (r.status === 'proposed' || r.status === 'pending_second_approval') r.status = 'superseded';
    }
    const fields = {
      findingId,
      revisionNumber,
      subject,
      severity: draft.severity,
      publicSummary: draft.publicSummary,
      internalRationale: draft.internalRationale,
      evidenceIds: [...source.evidenceIds],
    };
    const independent = draft.severity === 'severe' || publicSeverity(findingId) === 'severe';
    const revision: FindingRevision = {
      ...fields,
      author: me,
      createdAt: at(),
      contentHash: revisionHash(fields),
      status: independent ? 'pending_second_approval' : 'proposed',
      isLatest: true,
      sourceCaseId: source.sourceCaseId,
    };
    store.revisions.push(revision);
    record({
      actor: me,
      action: 'finding_revision_submitted',
      caseId: source.sourceCaseId,
      reason: draft.internalRationale,
      changes: [
        { field: `finding ${findingId}`, from: null, to: `revision ${revisionNumber} (${draft.severity})` },
      ],
    });
    return revision;
  }

  /** The currently public finding as staff see it, or `undefined` when it is not public. */
  function staffFinding(findingId: string): StaffFinding | undefined {
    const address = store.addresses.find((a) => a.findings.some((f) => f.id === findingId));
    const f = address?.findings.find((x) => x.id === findingId);
    const p = store.findingParticipants.get(findingId);
    if (!address || !f || !p) return undefined;
    const review = [...store.cases.values()].find(
      (c) => c.type === 'suspension_review' && c.status === 'open' && c.suspendedFinding.findingId === f.id,
    );
    const original = store.suspended.get(f.id)?.finding;
    return {
      findingId: f.id,
      title: original?.title ?? f.title,
      severity: findingSeveritySchema.parse(p.severity),
      subject: {
        kind: 'address',
        chain: address.chain,
        address: address.address,
        displayAddress: address.displayAddress,
      },
      author: p.author,
      approver: p.approver,
      publishedAt: f.publishedAt,
      status: f.disputeState === 'suspended_pending_review' ? 'suspended' : 'published',
      reviewCaseId: review?.id ?? null,
    };
  }

  function findingHistory(finding: StaffFinding): FindingHistory {
    const revisions = store.revisions
      .filter((r) => r.findingId === finding.findingId)
      .sort((a, b) => b.revisionNumber - a.revisionNumber);
    const original = store.suspended.get(finding.findingId)?.finding;
    const shown = store.addresses.flatMap((a) => a.findings).find((f) => f.id === finding.findingId);
    return {
      finding: clone(finding),
      revisions: revisions.map(clone),
      publicText: original?.summary ?? shown?.summary ?? null,
      approvalBlockedReason:
        finding.status === 'suspended'
          ? 'An emergency suspension review is open. No revision can be published until it is resolved.'
          : null,
    };
  }

  /** Member-visible effects of a decision: notices, public changes. Never internal text. */
  function applyEffects(c: CaseDetail, me: StaffRef, d: CaseDecision): void {
    switch (d.action) {
      case 'request_info':
        c.infoRequest = d.messageToSubmitter;
        notifyOwner(c, `Staff asked for more information about “${c.title}”.`);
        return;
      case 'accept_report':
        createRevision(c, me, d);
        notifyOwner(c, `Your report “${c.title}” was accepted. A finding is being prepared for approval.`);
        return;
      case 'reject_report':
      case 'reject_abusive':
      case 'reject_correction':
      case 'reject_suggestion':
      case 'reject_response':
        notifyOwner(c, `A decision was recorded on “${c.title}”.`);
        return;
      case 'publish_response':
        if (c.type === 'subject_response') {
          publishResponse(store, c, at());
          notifyOwner(c, `Your response “${c.title}” was published.`);
        }
        return;
      case 'reinstate_finding':
        if (c.type === 'suspension_review')
          reinstateFinding(store, c.suspendedFinding.findingId, d.publicSummary, at());
        return;
      case 'reverse_finding':
        if (c.type === 'suspension_review') {
          reverseSuspendedFinding(store, c.suspendedFinding.findingId, d.publicSummary, at());
        }
        return;
      case 'uphold':
      case 'amend':
      case 'reverse':
        if (c.type === 'appeal_review') {
          const outcome = d.action === 'uphold' ? 'upheld' : d.action === 'amend' ? 'amended' : 'reversed';
          const findingId = c.appealedDecision.findingId;
          if (d.action === 'amend') {
            // The amendment is a new revision; the public text changes only after a fresh
            // approval under moderation §4.1 (§8.1, §9).
            const latest = store.revisions.find((r) => r.findingId === findingId && r.isLatest);
            appendRevision(findingId, c.subject, me, d, {
              evidenceIds: latest?.evidenceIds ?? [],
              sourceCaseId: c.id,
            });
          }
          applyAppealOutcome(store, findingId, outcome, d.publicSummary, at());
          notifyOwner(c, `Your appeal “${c.title}” was decided: ${outcome}.`);
        }
        return;
      case 'accept_correction':
        if (c.type === 'correction_request') {
          applyProjectCorrection(store, c, at());
          const subject = c.subject;
          const project =
            subject.kind === 'project' ? store.projects.find((p) => p.slug === subject.slug) : undefined;
          if (project) {
            record({
              actor: me,
              action: 'profile_revised',
              caseId: c.id,
              reason: null,
              changes: [
                {
                  field: 'profile revision',
                  from: String(project.profileRevision - 1),
                  to: String(project.profileRevision),
                },
                ...c.changes.map((ch) => ({ field: ch.label, from: ch.current, to: ch.proposed })),
              ],
            });
          }
          notifyOwner(c, `Your correction “${c.title}” was accepted and the profile was updated.`);
        }
        return;
      case 'accept_suggestion':
        if (c.type === 'project_suggestion') {
          const slug = createProjectFromSuggestion(store, c, at());
          c.resultingSlug = slug;
          record({
            actor: me,
            action: 'profile_revised',
            caseId: c.id,
            reason: null,
            changes: [{ field: 'project profile', from: null, to: slug }],
          });
          notifyOwner(c, `Your suggestion “${c.title}” was accepted. Staff published a project profile.`);
        }
        return;
      case 'grant_standing':
      case 'deny_standing':
        if (c.type === 'appeal_review' || c.type === 'subject_response') {
          c.standing = {
            ...c.standing,
            outcome: d.action === 'grant_standing' ? 'granted' : 'denied',
            decidedAt: at(),
          };
          notifyOwner(
            c,
            d.action === 'grant_standing'
              ? `Standing was granted for “${c.title}”.`
              : `Standing could not be established for “${c.title}”. You can reply with more documents.`,
          );
        }
        return;
      case 'start_review':
        return;
    }
  }

  const api: ModerationApi = {
    async getQueue(request) {
      await wait();
      const who = identity();
      if (!who || !hasPermission(who.role, 'moderation:queue:read')) {
        return err('forbidden', 'Staff access is required.');
      }
      const q: QueueQuery = { assignment: 'any', sort: 'sla_due', page: 1, ...request };
      if (q.query === QUEUE_ERROR_QUERY) throw new Error('Mock failure for the error-state fixture.');
      const visible = [...store.cases.values()].filter((c) => inScope(who.role, c));
      const counts = {
        openReports: visible.filter((c) => c.type === 'report_review' && isOpen(c)).length,
        needsInfo: visible.filter((c) => c.status === 'needs_info' || c.status === 'needs_information')
          .length,
        openAppeals: visible.filter((c) => c.type === 'appeal_review' && isOpen(c)).length,
        openCorrections: visible.filter((c) => c.type === 'correction_request' && isOpen(c)).length,
        openSuggestions: visible.filter((c) => c.type === 'project_suggestion' && isOpen(c)).length,
        openResponses: visible.filter((c) => c.type === 'subject_response' && isOpen(c)).length,
        openSuspensionReviews: visible.filter((c) => c.type === 'suspension_review' && isOpen(c)).length,
        unassigned: visible.filter((c) => isOpen(c) && c.assignedTo === null).length,
        pendingApprovals: hasPermission(who.role, 'finding:publish')
          ? store.revisions.filter(
              (r) => r.isLatest && (r.status === 'proposed' || r.status === 'pending_second_approval'),
            ).length
          : 0,
      };
      const needle = q.query?.trim().toLowerCase() ?? '';
      const items = visible
        .filter((c) => !q.type || c.type === q.type)
        .filter((c) => !q.status || c.status === q.status)
        .filter((c) => !q.chain || c.chain === q.chain)
        .filter((c) =>
          q.assignment === 'mine'
            ? c.assignedTo?.id === who.ref.id
            : q.assignment === 'unassigned'
              ? c.assignedTo === null
              : true,
        )
        .filter((c) => {
          if (!needle) return true;
          const subjectText =
            c.subject.kind === 'address' ? c.subject.address : `${c.subject.slug} ${c.subject.name}`;
          return [c.id, c.title, subjectText].some((t) => t.toLowerCase().includes(needle));
        })
        .sort((a, b) => {
          const tie = a.id.localeCompare(b.id);
          if (q.sort === 'newest') return b.submittedAt.localeCompare(a.submittedAt) || tie;
          if (q.sort === 'last_activity') return b.lastActivityAt.localeCompare(a.lastActivityAt) || tie;
          // Deadline order puts open cases first: a closed case's deadline no longer matters.
          return Number(!isOpen(a)) - Number(!isOpen(b)) || a.slaDueAt.localeCompare(b.slaDueAt) || tie;
        })
        .map(summary);
      const totalPages = Math.max(1, Math.ceil(items.length / QUEUE_PAGE_SIZE));
      const page = Math.min(q.page, totalPages);
      return ok({
        counts,
        items: items.slice((page - 1) * QUEUE_PAGE_SIZE, page * QUEUE_PAGE_SIZE),
        page,
        totalItems: items.length,
        totalPages,
      });
    },

    async getCase(caseId) {
      await wait();
      const who = identity();
      if (!who) return err('forbidden', 'Staff access is required.');
      const c = store.cases.get(caseId);
      if (!c || !inScope(who.role, c)) return { kind: 'error', code: 'not_found' };
      return ok(view(c));
    },

    async assign(caseId, expectedVersion, target) {
      await wait();
      const g = guardMutation(caseId, expectedVersion);
      if (!g.ok) return g.result;
      const { c, me, role } = g;
      if (!hasPermission(role, 'moderation:case:assign')) {
        return err('forbidden', 'Your role cannot assign cases.');
      }
      if (target.to === 'me') {
        if (c.assignedTo?.id === me.id) return ok(view(c));
        if (c.assignedTo && !target.takeOver) {
          return err(
            'not_eligible',
            `This case is assigned to ${c.assignedTo.handle}. Confirm to take it over.`,
          );
        }
        const from = c.assignedTo?.handle ?? null;
        c.assignedTo = me;
        touch(c);
        record({
          actor: me,
          action: 'case_assigned',
          caseId,
          reason: null,
          changes: [{ field: 'assigned_to', from, to: me.handle }],
        });
      } else {
        if (!c.assignedTo) return ok(view(c));
        if (c.assignedTo.id !== me.id && role !== 'admin') {
          return err('forbidden', 'Only the assigned reviewer or an administrator can unassign this case.');
        }
        const from = c.assignedTo.handle;
        c.assignedTo = null;
        touch(c);
        record({
          actor: me,
          action: 'case_unassigned',
          caseId,
          reason: null,
          changes: [{ field: 'assigned_to', from, to: null }],
        });
      }
      return ok(view(c));
    },

    async addNote(caseId, expectedVersion, text) {
      await wait();
      const g = guardMutation(caseId, expectedVersion);
      if (!g.ok) return g.result;
      const { c, me } = g;
      const trimmed = text.trim();
      if (trimmed.length === 0 || trimmed.length > 2000) {
        return err('invalid_transition', 'A note needs between 1 and 2000 characters.');
      }
      c.notes.push({ id: `note-${c.id}-${c.notes.length + 1}`, author: me, at: at(), text: trimmed });
      touch(c);
      record({ actor: me, action: 'case_note_added', caseId, reason: null, changes: [] });
      return ok(view(c));
    },

    async verifyStepUp(action, targetId, parameters = []): Promise<PasskeyResult> {
      await wait();
      const who = identity();
      if (!who || currentScenario(options.cookies()) === 'session_expired')
        return { kind: 'session_expired' };
      const kind = currentPasskeyResult(options.cookies());
      if (kind === 'verified')
        issueGrant(
          store,
          who.ref.id,
          options.cookies(),
          action,
          targetId,
          parameters,
          now().getTime() + STEP_UP_TTL_MS,
        );
      return { kind };
    },

    async decide(caseId, expectedVersion, decision) {
      await wait();
      const g = guardMutation(caseId, expectedVersion);
      if (!g.ok) return g.result;
      const { c, me, role } = g;
      const parsed = caseDecisionSchema.safeParse(decision);
      if (!parsed.success) return err('invalid_transition', 'The decision is incomplete.');
      const d = parsed.data;
      const rule = TRANSITIONS[d.action].find((t) => t.type === c.type);
      if (!rule) return err('invalid_transition', 'This decision does not apply to this kind of case.');
      if (!hasPermission(role, rule.permission)) {
        return err(
          'forbidden',
          rule.permission === 'project:manage'
            ? 'Creating a project profile needs project management permission (administrators).'
            : 'Your role cannot make this decision.',
        );
      }
      if (d.action === 'accept_correction' && !hasPermission(role, 'project:manage')) {
        return err(
          'forbidden',
          'Changing a project profile needs project management permission (administrators).',
        );
      }
      if (!rule.from.includes(c.status)) {
        return err(
          'invalid_transition',
          `A case that is “${c.status.replaceAll('_', ' ')}” cannot take this decision.`,
        );
      }
      if (c.type === 'appeal_review' || c.type === 'subject_response') {
        if (
          (d.action === 'grant_standing' || d.action === 'deny_standing') &&
          c.standing.outcome !== 'pending'
        ) {
          return err('invalid_transition', 'Standing has already been decided for this case.');
        }
        if (
          ['uphold', 'amend', 'reverse', 'publish_response'].includes(d.action) &&
          c.standing.outcome !== 'granted'
        ) {
          return err('invalid_transition', 'Standing must be granted before this case can be decided.');
        }
      }
      if (d.action !== 'start_review') {
        if (!c.assignedTo) return err('not_eligible', 'Assign the case to yourself before deciding.');
        if (c.assignedTo.id !== me.id) {
          return err(
            'not_eligible',
            `Only the assigned reviewer (${c.assignedTo.handle}) can decide this case.`,
          );
        }
      } else if (c.assignedTo && c.assignedTo.id !== me.id) {
        return err('not_eligible', `This case is assigned to ${c.assignedTo.handle}. Take it over first.`);
      }
      if (c.type === 'appeal_review') {
        const publishedRevision = store.revisions.find(
          (revision) =>
            revision.findingId === c.appealedDecision.findingId && revision.status === 'published',
        );
        if (
          store.reversedFindings.has(c.appealedDecision.findingId) ||
          !publishedRevision ||
          publishedRevision.revisionNumber !== c.appealedDecision.revisionNumber
        ) {
          return {
            kind: 'error',
            code: 'conflict',
            currentVersion: publishedRevision?.revisionNumber ?? c.appealedDecision.revisionNumber,
            detail: 'The published finding changed. Review a fresh appeal against its current revision.',
          };
        }
        const participants = [c.appealedDecision.author.id, c.appealedDecision.approver.id];
        if (participants.includes(me.id) || participantIds(store, c.appealedDecision.findingId).has(me.id)) {
          return err(
            'not_eligible',
            'You took part in the decision under appeal (author or approver), so you cannot review this appeal or its standing.',
          );
        }
      }
      if (c.type === 'suspension_review') {
        const f = c.suspendedFinding;
        if ([f.author.id, f.approver.id].includes(me.id)) {
          return err(
            'not_eligible',
            'You took part in this finding (author or approver). A non-participant must review the suspension.',
          );
        }
        if (d.action === 'reverse_finding' && f.severity === 'severe' && c.suspendedBy.id === me.id) {
          return err(
            'not_eligible',
            'You suspended this severe finding. Reversing it needs a second person who is not a participant.',
          );
        }
      }
      if (
        d.action === 'accept_correction' &&
        c.type === 'correction_request' &&
        c.subject.kind === 'project'
      ) {
        const slug = c.subject.slug;
        const profile = store.projects.find((p) => p.slug === slug);
        if (!profile || profile.profileRevision !== c.currentRevision) {
          return {
            kind: 'error',
            code: 'conflict',
            currentVersion: profile?.profileRevision ?? c.currentRevision,
            detail: 'The public profile changed. Review a fresh correction against its latest revision.',
          };
        }
      }
      if (rule.stepUp && !consumeGrant(stepUpActionFor(d.action), caseId, [caseId, expectedVersion, d]))
        return { kind: 'error', code: 'stepup_required' };

      const from = c.status;
      if (d.action === 'start_review' && !c.assignedTo) {
        c.assignedTo = me;
        record({
          actor: me,
          action: 'case_assigned',
          caseId,
          reason: null,
          changes: [{ field: 'assigned_to', from: null, to: me.handle }],
        });
      }
      if (rule.to !== null) Object.assign(c, { status: rule.to });
      touch(c);
      const reason = 'internalRationale' in d ? d.internalRationale : null;
      record({
        actor: me,
        action:
          d.action === 'grant_standing' || d.action === 'deny_standing'
            ? 'standing_decided'
            : c.type === 'appeal_review' && rule.stepUp
              ? 'appeal_decided'
              : (c.type === 'correction_request' || c.type === 'project_suggestion') && rule.stepUp
                ? 'correction_decided'
                : c.type === 'subject_response' && rule.stepUp
                  ? 'response_decided'
                  : d.action === 'reinstate_finding'
                    ? 'finding_reinstated'
                    : d.action === 'reverse_finding'
                      ? 'finding_reversed'
                      : d.action === 'request_info'
                        ? 'info_requested'
                        : 'case_status_changed',
        caseId,
        reason,
        changes:
          rule.to !== null
            ? [{ field: 'status', from, to: rule.to }]
            : [
                {
                  field: 'standing',
                  from: 'pending',
                  to: d.action === 'grant_standing' ? 'granted' : 'denied',
                },
              ],
      });
      if ('publicSummary' in d) c.publicSummary = d.publicSummary;
      if ('reason' in d) c.submitterReason = d.reason;
      if (d.action !== 'request_info' && rule.to !== null) c.infoRequest = null;
      applyEffects(c, me, d);
      return ok(view(c));
    },

    async listRevisions() {
      await wait();
      const who = identity();
      if (!who || !hasPermission(who.role, 'finding:publish')) {
        return err('forbidden', 'Approving findings needs a moderator or administrator role.');
      }
      return ok(store.revisions.map(clone));
    },

    async approveRevision(findingId, revisionNumber, contentHash) {
      await wait();
      const who = identity();
      if (!who || !hasPermission(who.role, 'finding:publish')) {
        return err('forbidden', 'Approving findings needs a moderator or administrator role.');
      }
      const target = store.revisions.find(
        (r) => r.findingId === findingId && r.revisionNumber === revisionNumber,
      );
      if (!target) return { kind: 'error', code: 'not_found' };
      if (!target.isLatest || target.contentHash !== contentHash) {
        const latest = store.revisions.find((r) => r.findingId === findingId && r.isLatest);
        return {
          kind: 'error',
          code: 'conflict',
          detail:
            'A newer revision of this finding exists. An approval only authorizes the exact revision it names.',
          currentVersion: latest?.revisionNumber ?? revisionNumber,
        };
      }
      if (store.reversedFindings.has(findingId)) {
        return err(
          'invalid_transition',
          'This finding was reversed and cannot be republished through a pending revision.',
        );
      }
      if (target.status !== 'proposed' && target.status !== 'pending_second_approval') {
        return err('invalid_transition', 'This revision is not waiting for approval.');
      }
      const publicFinding = store.addresses.flatMap((a) => a.findings).find((f) => f.id === findingId);
      const publicRevision = store.revisions.find(
        (r) => r.findingId === findingId && r.status === 'published',
      );
      const replacesSevere =
        publicRevision?.severity === 'severe' ||
        (publicFinding !== undefined && store.findingParticipants.get(findingId)?.severity === 'severe');
      if (
        store.suspended.has(findingId) ||
        publicFinding?.disputeState === 'suspended_pending_review' ||
        [...store.cases.values()].some(
          (c) =>
            c.type === 'suspension_review' &&
            c.status === 'open' &&
            c.suspendedFinding.findingId === findingId,
        )
      ) {
        return err(
          'invalid_transition',
          'Resolve the emergency suspension review before publishing a revision.',
        );
      }
      if (target.severity === 'severe' || replacesSevere) {
        if (!hasPermission(who.role, 'finding:approve_severe'))
          return err('forbidden', 'Severe approval needs finding:approve_severe.');
        const authors = store.revisions.filter((r) => r.findingId === findingId).map((r) => r.author.id);
        if (
          authors.includes(who.ref.id) ||
          (replacesSevere &&
            [
              publicRevision?.author.id,
              store.findingParticipants.get(findingId)?.author.id,
              store.findingParticipants.get(findingId)?.approver.id,
            ].includes(who.ref.id))
        ) {
          return err(
            'not_eligible',
            'Severe findings need an independent approver. You authored a revision of this finding.',
          );
        }
      }
      const allEvidence = [...store.cases.values()].flatMap((c) => c.evidence);
      const missing = target.evidenceIds.filter(
        (id) => allEvidence.find((e) => e.id === id)?.state !== 'available',
      );
      if (missing.length > 0) {
        return err(
          'evidence_unavailable',
          `Evidence ${missing.join(', ')} is not available yet, so nothing can be published.`,
        );
      }
      if (!consumeGrant('finding.approve', findingId, [findingId, revisionNumber, contentHash]))
        return { kind: 'error', code: 'stepup_required' };
      const previous = target.status;
      for (const r of store.revisions) {
        if (r.findingId !== findingId) continue;
        if (r === target) r.status = 'published';
        else if (r.status === 'published') r.status = 'superseded';
      }
      const participants = participantIds(store, findingId);
      participants.add(who.ref.id);
      store.findingParticipantHistory.set(findingId, participants);
      store.findingParticipants.set(findingId, {
        author: target.author,
        approver: who.ref,
        severity: target.severity,
      });
      const caseId = target.sourceCaseId;
      record({
        actor: who.ref,
        action: 'finding_approved',
        caseId,
        reason: `Approved revision ${revisionNumber} (${contentHash}).`,
        changes: [{ field: `finding ${findingId}`, from: previous, to: 'approved' }],
      });
      record({
        actor: 'system',
        action: 'finding_became_public',
        caseId,
        reason: null,
        changes: [{ field: `finding ${findingId}`, from: 'approved', to: 'published' }],
      });
      publishFinding(store, target, at());
      return ok(store.revisions.map(clone));
    },

    async rejectRevision(findingId, revisionNumber, rationale) {
      await wait();
      const who = identity();
      if (!who || !hasPermission(who.role, 'finding:publish')) {
        return err('forbidden', 'Rejecting findings needs a moderator or administrator role.');
      }
      const target = store.revisions.find(
        (r) => r.findingId === findingId && r.revisionNumber === revisionNumber,
      );
      if (!target) return { kind: 'error', code: 'not_found' };
      if (target.status !== 'proposed' && target.status !== 'pending_second_approval') {
        return err('invalid_transition', 'This revision is not waiting for approval.');
      }
      if (rationale.trim().length < 10)
        return err('invalid_transition', 'A rejection needs a rationale of at least 10 characters.');
      if (!consumeGrant('finding.reject', findingId, [findingId, revisionNumber, rationale.trim()]))
        return { kind: 'error', code: 'stepup_required' };
      const previous = target.status;
      target.status = 'rejected';
      record({
        actor: who.ref,
        action: 'finding_rejected',
        caseId: target.sourceCaseId,
        reason: rationale.trim(),
        changes: [{ field: `finding ${findingId}`, from: previous, to: 'rejected' }],
      });
      return ok(store.revisions.map(clone));
    },

    async getAuditLog(caseId) {
      await wait();
      const who = identity();
      if (!who || !hasPermission(who.role, 'audit:read')) {
        return err('forbidden', 'The audit history is available to administrators only.');
      }
      const entries = store.audit
        .filter((e) => !caseId || e.caseId === caseId)
        .sort((a, b) => b.at.localeCompare(a.at));
      return ok(entries.map(clone));
    },

    async listFindings() {
      await wait();
      const who = identity();
      if (!who || !hasPermission(who.role, 'finding:suspend')) {
        return err('forbidden', 'Suspending findings needs a moderator or administrator role.');
      }
      const out = store.addresses
        .flatMap((a) => a.findings)
        .map((f) => staffFinding(f.id))
        .filter((f): f is StaffFinding => f !== undefined);
      return ok(out.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)));
    },

    async suspendFinding(findingId, reason) {
      await wait();
      const who = identity();
      if (!who || !hasPermission(who.role, 'finding:suspend')) {
        return err('forbidden', 'Suspending findings needs a moderator or administrator role.');
      }
      const parsed = suspensionRequestSchema.safeParse({ reason });
      if (!parsed.success)
        return err('invalid_transition', 'Give an internal reason of at least 10 characters.');
      const address = store.addresses.find((a) => a.findings.some((f) => f.id === findingId));
      const finding = address?.findings.find((f) => f.id === findingId);
      const p = store.findingParticipants.get(findingId);
      if (!address || !finding || !p) return { kind: 'error', code: 'not_found' };
      if (finding.disputeState === 'suspended_pending_review') {
        return err('invalid_transition', 'This finding is already suspended.');
      }
      if (!consumeGrant('finding.suspend', findingId, [findingId, reason.trim()]))
        return { kind: 'error', code: 'stepup_required' };
      const original = structuredClone(finding);
      suspendFinding(store, findingId, at());
      const id = nextId(store, 'SUS');
      const severity = findingSeveritySchema.parse(p.severity);
      const review: CaseDetail = {
        id,
        type: 'suspension_review',
        status: 'open',
        subject: {
          kind: 'address',
          chain: address.chain,
          address: address.address,
          displayAddress: address.displayAddress,
        },
        chain: address.chain,
        title: `Suspension review: ${original.title}`,
        assignedTo: null,
        submittedAt: at(),
        lastActivityAt: at(),
        slaDueAt: new Date(now().getTime() + 72 * 60 * 60 * 1000).toISOString(),
        version: 1,
        evidence: [],
        notes: [],
        history: [],
        assessment: null,
        submitterReason: null,
        publicSummary: null,
        infoRequest: null,
        submitterMessages: [],
        suspendedFinding: {
          findingId,
          revisionNumber:
            store.revisions.find((r) => r.findingId === findingId && r.status === 'published')
              ?.revisionNumber ?? 1,
          severity,
          publicSummary: original.summary,
          author: p.author,
          approver: p.approver,
          publishedAt: original.publishedAt,
        },
        suspendedBy: who.ref,
        suspensionReason: parsed.data.reason,
      };
      store.cases.set(id, review);
      record({
        actor: who.ref,
        action: 'finding_suspended',
        caseId: id,
        reason: parsed.data.reason,
        changes: [{ field: `finding ${findingId}`, from: 'published', to: 'suspended' }],
      });
      if (severity === 'severe') {
        const text = `${who.ref.handle} suspended severe finding ${findingId}. A non-participant must review it within 72 hours (${id}).`;
        store.alerts.unshift({ id: `alert-${id}`, at: at(), text });
        record({ actor: 'system', action: 'admin_alert', caseId: id, reason: text, changes: [] });
      }
      return ok(view(review));
    },

    async getFindingHistory(findingId) {
      await wait();
      const who = identity();
      if (!who || !hasPermission(who.role, 'finding:propose')) {
        return err('forbidden', 'Revising findings needs a moderator or administrator role.');
      }
      const finding = staffFinding(findingId);
      if (!finding) return { kind: 'error', code: 'not_found' };
      return ok(findingHistory(finding));
    },

    async proposeRevision(findingId, base, draft) {
      await wait();
      const who = identity();
      if (!who || !hasPermission(who.role, 'finding:propose')) {
        return err('forbidden', 'Revising findings needs a moderator or administrator role.');
      }
      const finding = staffFinding(findingId);
      if (!finding) return { kind: 'error', code: 'not_found' };
      const parsedBase = revisionBaseSchema.safeParse(base);
      const parsed = revisionDraftSchema.safeParse(draft);
      if (!parsedBase.success || !parsed.success) {
        return err(
          'invalid_transition',
          'Give a severity, a public summary and an internal rationale of at least 10 characters.',
        );
      }
      const latest = store.revisions.find((r) => r.findingId === findingId && r.isLatest);
      if (
        !latest ||
        latest.revisionNumber !== parsedBase.data.revisionNumber ||
        latest.contentHash !== parsedBase.data.contentHash
      ) {
        return {
          kind: 'error',
          code: 'conflict',
          detail:
            'Someone added a newer revision. Load the latest revision and make your change on top of it.',
          currentVersion: latest?.revisionNumber ?? parsedBase.data.revisionNumber,
        };
      }
      if (
        latest.severity === parsed.data.severity &&
        latest.publicSummary === parsed.data.publicSummary &&
        latest.internalRationale === parsed.data.internalRationale
      ) {
        return err('invalid_transition', 'Nothing changed. A new revision must change something.');
      }
      appendRevision(findingId, latest.subject, who.ref, parsed.data, {
        evidenceIds: latest.evidenceIds,
        sourceCaseId: null,
      });
      return ok(findingHistory(finding));
    },

    async listRecoveryVerifications() {
      await wait();
      const who = identity();
      if (!who || !hasPermission(who.role, 'staff:recovery:verify')) {
        return err('forbidden', 'Recovery verification needs a moderator or administrator role.');
      }
      return ok(
        store.recoveries.filter((r) => r.state === 'verifying' && r.subject.id !== who.ref.id).map(clone),
      );
    },

    async verifyRecoveryIdentity(id, method, rationale) {
      await wait();
      const who = identity();
      if (!who || !hasPermission(who.role, 'staff:recovery:verify')) {
        return err('forbidden', 'Recovery verification needs a moderator or administrator role.');
      }
      return addRecoveryVerification(
        store,
        id,
        { ref: who.ref, isAdmin: who.role === 'admin' },
        method,
        rationale,
        at(),
      );
    },

    async getProfileState(slug) {
      await wait();
      const who = identity();
      if (!who || !hasPermission(who.role, 'moderation:case:read'))
        return err('forbidden', 'Staff access is required.');
      const project = store.projects.find((p) => p.slug === slug);
      return project
        ? ok({
            slug,
            revision: project.profileRevision,
            description: project.description,
            domains: project.domains.map((d) => d.hostname),
          })
        : { kind: 'error', code: 'not_found' };
    },
  };
  return api;
}
