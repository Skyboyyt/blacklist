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
 * 5. allowed transition for the case type and status (moderation §9–§10);
 * 6. assignment (only the assigned reviewer decides);
 * 7. independence (moderation §4.1, §7, §9);
 * 8. a fresh, single-use, action-bound step-up for consequential decisions.
 * State lives in memory for the page session. The audit trail is MOCK history only.
 */
import {
  caseDecisionSchema,
  QUEUE_PAGE_SIZE,
  type AuditEntry,
  type CaseDecision,
  type CaseDetail,
  type CaseSummary,
  type FindingRevision,
  type PasskeyResult,
  type QueueQuery,
  type StaffRef,
  type StaffRole,
} from '@blacklist/contracts';
import { hasPermission, type StaffPermission } from '@/lib/staff/permissions';
import type { ModerationApi, ModerationResult, ProfileState } from '../types';
import { ADDRESS_FIXTURES } from './fixtures/addresses';
import {
  CASE_FIXTURES,
  CONFLICT_CASE_ID,
  QUEUE_ERROR_QUERY,
  REVISION_FIXTURES,
  STAFF,
} from './fixtures/moderation';
import { PROJECT_ADDRESS_FIXTURES, PROJECT_FIXTURES } from './fixtures/projects';
import { applyCorrection } from './profile-corrections';
import { currentPasskeyResult, currentScenario, currentViewerKey, type MockViewerKey } from './scenario';
import { staffAssessmentFor } from './staff-scoring';

export interface MockModerationOptions {
  readonly cookies: () => string;
  readonly now?: () => Date;
  readonly latencyMs?: number;
}

const STEP_UP_TTL_MS = 5 * 60 * 1000;
const OPEN_REPORT = ['submitted', 'screening', 'queued', 'in_review', 'needs_info'];
const OPEN_REVIEW = ['submitted', 'in_review'];

const IDENTITIES: Partial<Record<MockViewerKey, { ref: StaffRef; role: StaffRole }>> = {
  moderator: { ref: STAFF.moderatorA, role: 'moderator' },
  moderator_b: { ref: STAFF.moderatorB, role: 'moderator' },
  appeal_reviewer: { ref: STAFF.appealReviewer, role: 'appeal_reviewer' },
  admin: { ref: STAFF.admin, role: 'admin' },
};

/** Rules per decision: which case type, from which statuses, to which status, with which permission. */
const TRANSITIONS: Record<
  CaseDecision['action'],
  {
    readonly type: CaseDetail['type'];
    readonly from: readonly string[];
    readonly to: string;
    readonly permission: StaffPermission;
    readonly stepUp: boolean;
  }[]
> = {
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
  ],
  request_info: [
    {
      type: 'report_review',
      from: ['in_review'],
      to: 'needs_info',
      permission: 'finding:propose',
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
};

/** The step-up action name a decision is bound to (identity §10.7). */
export function stepUpActionFor(decision: CaseDecision['action']): string {
  return `case.${decision}`;
}

/** Deterministic short content hash for demo revisions (not cryptographic). */
function demoHash(text: string): string {
  let h = 0xcbf29ce4;
  let g = 0x84222325;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
    g = Math.imul(g ^ text.charCodeAt(i), 0x0100019b) >>> 0;
  }
  return h.toString(16).padStart(8, '0') + g.toString(16).padStart(8, '0');
}

const clone = <T>(value: T): T => structuredClone(value);
const ok = <T>(data: T): ModerationResult<T> => ({ kind: 'ok', data });

export function createMockModerationApi(options: MockModerationOptions): ModerationApi {
  const now = options.now ?? (() => new Date());
  const latency = options.latencyMs ?? 300;
  const wait = () => (latency > 0 ? new Promise<void>((r) => setTimeout(r, latency)) : Promise.resolve());

  const cases = new Map<string, CaseDetail>(CASE_FIXTURES.map((c) => [c.id, clone(c)]));
  let revisions: FindingRevision[] = REVISION_FIXTURES.map(clone);
  const audit: AuditEntry[] = CASE_FIXTURES.flatMap((c) => c.history.map(clone));
  const grants = new Map<string, number>();
  const profiles = new Map<string, ProfileState>(
    PROJECT_FIXTURES.map((p) => [
      p.slug,
      {
        slug: p.slug,
        revision: p.profileRevision,
        description: p.description,
        domains: p.domains.map((d) => d.hostname),
      },
    ]),
  );
  let conflictPending = true;
  let auditSeq = 0;
  const research = [...ADDRESS_FIXTURES, ...PROJECT_ADDRESS_FIXTURES];

  const identity = () => IDENTITIES[currentViewerKey(options.cookies())] ?? null;
  const at = () => now().toISOString();

  function err<T>(
    code: 'forbidden' | 'invalid_transition' | 'not_eligible' | 'evidence_unavailable',
    detail: string,
  ): ModerationResult<T> {
    return { kind: 'error', code, detail };
  }

  function record(entry: Omit<AuditEntry, 'id' | 'at'>): void {
    auditSeq += 1;
    audit.push({ id: `audit-${auditSeq}`, at: at(), ...entry });
  }

  function inScope(role: StaffRole, c: CaseDetail): boolean {
    return role !== 'appeal_reviewer' || c.type === 'appeal_review';
  }

  function view(c: CaseDetail): CaseDetail {
    const detail = clone(c);
    detail.history = audit.filter((e) => e.caseId === c.id).sort((a, b) => a.at.localeCompare(b.at));
    if (c.subject.kind === 'address') {
      const subject = c.subject;
      const r = research.find((a) => a.chain === subject.chain && a.address === subject.address);
      detail.assessment = r ? staffAssessmentFor(r) : null;
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
    if (c.type === 'report_review')
      return { ...common, type: c.type, status: c.status, category: c.category };
    if (c.type === 'appeal_review') return { ...common, type: c.type, status: c.status };
    return { ...common, type: c.type, status: c.status };
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
    const c = cases.get(caseId);
    if (!c || !inScope(who.role, c)) return { ok: false, result: { kind: 'error', code: 'not_found' } };
    if (caseId === CONFLICT_CASE_ID && conflictPending) {
      conflictPending = false;
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

  function consumeGrant(action: string, targetId: string): boolean {
    const key = `${action}:${targetId}`;
    const expires = grants.get(key);
    grants.delete(key);
    return expires !== undefined && expires > now().getTime();
  }

  function createRevision(
    c: CaseDetail,
    me: StaffRef,
    d: Extract<CaseDecision, { action: 'accept_report' }>,
  ): void {
    const findingId = `demo-finding-${600 + revisions.filter((r) => r.revisionNumber === 1).length}`;
    const content = JSON.stringify([
      findingId,
      1,
      c.subject,
      d.severity,
      d.publicSummary,
      d.internalRationale,
    ]);
    revisions = [
      ...revisions,
      {
        findingId,
        revisionNumber: 1,
        subject: c.subject,
        severity: d.severity,
        publicSummary: d.publicSummary,
        internalRationale: d.internalRationale,
        evidenceIds: c.evidence.filter((e) => e.state === 'available').map((e) => e.id),
        author: me,
        createdAt: at(),
        contentHash: demoHash(content),
        status: d.severity === 'severe' ? 'pending_second_approval' : 'proposed',
        isLatest: true,
        sourceCaseId: c.id,
      },
    ];
    record({
      actor: me,
      action: 'finding_revision_submitted',
      caseId: c.id,
      reason: d.internalRationale,
      changes: [{ field: `finding ${findingId}`, from: null, to: `revision 1 (${d.severity})` }],
    });
  }

  const api: ModerationApi = {
    async getQueue(request) {
      await wait();
      const who = identity();
      if (!who || !hasPermission(who.role, 'moderation:queue:read')) {
        return err('forbidden', 'Staff access is required.');
      }
      const q: QueueQuery = {
        assignment: 'any',
        sort: 'sla_due',
        page: 1,
        ...request,
      };
      if (q.query === QUEUE_ERROR_QUERY) throw new Error('Mock failure for the error-state fixture.');
      const visible = [...cases.values()].filter((c) => inScope(who.role, c));
      const open = (c: CaseDetail) =>
        c.type === 'report_review' ? OPEN_REPORT.includes(c.status) : OPEN_REVIEW.includes(c.status);
      const counts = {
        openReports: visible.filter((c) => c.type === 'report_review' && open(c)).length,
        needsInfo: visible.filter((c) => c.type === 'report_review' && c.status === 'needs_info').length,
        openAppeals: visible.filter((c) => c.type === 'appeal_review' && open(c)).length,
        openCorrections: visible.filter((c) => c.type === 'correction_request' && open(c)).length,
        unassigned: visible.filter((c) => open(c) && c.assignedTo === null).length,
        pendingApprovals: hasPermission(who.role, 'finding:publish')
          ? revisions.filter(
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
          return Number(!open(a)) - Number(!open(b)) || a.slaDueAt.localeCompare(b.slaDueAt) || tie;
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
      const c = cases.get(caseId);
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

    async verifyStepUp(action, targetId): Promise<PasskeyResult> {
      await wait();
      if (!identity() || currentScenario(options.cookies()) === 'session_expired')
        return { kind: 'session_expired' };
      const kind = currentPasskeyResult(options.cookies());
      if (kind === 'verified') grants.set(`${action}:${targetId}`, now().getTime() + STEP_UP_TTL_MS);
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
      if (!hasPermission(role, rule.permission))
        return err('forbidden', 'Your role cannot make this decision.');
      if (d.action === 'accept_correction' && !hasPermission(role, 'project:manage')) {
        return err(
          'forbidden',
          'Changing a project profile needs project management permission (administrators).',
        );
      }
      if (!rule.from.includes(c.status)) {
        return err(
          'invalid_transition',
          `A case that is “${c.status.replace('_', ' ')}” cannot take this decision.`,
        );
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
        const participants = [c.appealedDecision.author.id, c.appealedDecision.approver.id];
        if (participants.includes(me.id)) {
          return err(
            'not_eligible',
            'You took part in the decision under appeal (author or approver), so you cannot review this appeal.',
          );
        }
      }
      if (rule.stepUp && !consumeGrant(stepUpActionFor(d.action), caseId))
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
      Object.assign(c, { status: rule.to });
      touch(c);
      const reason = 'internalRationale' in d ? d.internalRationale : null;
      record({
        actor: me,
        action:
          c.type === 'appeal_review' && rule.stepUp
            ? 'appeal_decided'
            : c.type === 'correction_request' && rule.stepUp
              ? 'correction_decided'
              : d.action === 'request_info'
                ? 'info_requested'
                : 'case_status_changed',
        caseId,
        reason,
        changes: [{ field: 'status', from, to: rule.to }],
      });
      if ('publicSummary' in d) c.publicSummary = d.publicSummary;
      if ('reason' in d) c.submitterReason = d.reason;
      if (d.action === 'accept_report') createRevision(c, me, d);
      if (
        d.action === 'accept_correction' &&
        c.type === 'correction_request' &&
        c.subject.kind === 'project'
      ) {
        const before = profiles.get(c.subject.slug);
        if (before) {
          const after = applyCorrection(before, c.changes);
          profiles.set(after.slug, after);
          record({
            actor: me,
            action: 'profile_revised',
            caseId,
            reason: null,
            changes: [
              { field: 'profile revision', from: String(before.revision), to: String(after.revision) },
              ...c.changes.map((ch) => ({ field: ch.label, from: ch.current, to: ch.proposed })),
            ],
          });
        }
      }
      return ok(view(c));
    },

    async listRevisions() {
      await wait();
      const who = identity();
      if (!who || !hasPermission(who.role, 'finding:publish')) {
        return err('forbidden', 'Approving findings needs a moderator or administrator role.');
      }
      return ok(revisions.map(clone));
    },

    async approveRevision(findingId, revisionNumber, contentHash) {
      await wait();
      const who = identity();
      if (!who || !hasPermission(who.role, 'finding:publish')) {
        return err('forbidden', 'Approving findings needs a moderator or administrator role.');
      }
      const target = revisions.find((r) => r.findingId === findingId && r.revisionNumber === revisionNumber);
      if (!target) return { kind: 'error', code: 'not_found' };
      if (!target.isLatest || target.contentHash !== contentHash) {
        const latest = revisions.find((r) => r.findingId === findingId && r.isLatest);
        return {
          kind: 'error',
          code: 'conflict',
          detail:
            'A newer revision of this finding exists. An approval only authorizes the exact revision it names.',
          currentVersion: latest?.revisionNumber ?? revisionNumber,
        };
      }
      if (target.status !== 'proposed' && target.status !== 'pending_second_approval') {
        return err('invalid_transition', 'This revision is not waiting for approval.');
      }
      if (target.severity === 'severe') {
        if (!hasPermission(who.role, 'finding:approve_severe'))
          return err('forbidden', 'Severe approval needs finding:approve_severe.');
        const authors = revisions.filter((r) => r.findingId === findingId).map((r) => r.author.id);
        if (authors.includes(who.ref.id)) {
          return err(
            'not_eligible',
            'Severe findings need an independent approver. You authored a revision of this finding.',
          );
        }
      }
      const allEvidence = [...cases.values()].flatMap((c) => c.evidence);
      const missing = target.evidenceIds.filter(
        (id) => allEvidence.find((e) => e.id === id)?.state !== 'available',
      );
      if (missing.length > 0) {
        return err(
          'evidence_unavailable',
          `Evidence ${missing.join(', ')} is not available yet, so nothing can be published.`,
        );
      }
      if (!consumeGrant('finding.approve', findingId)) return { kind: 'error', code: 'stepup_required' };
      revisions = revisions.map((r) =>
        r.findingId !== findingId
          ? r
          : r === target
            ? { ...r, status: 'published' }
            : r.status === 'published'
              ? { ...r, status: 'superseded' }
              : r,
      );
      const caseId = target.sourceCaseId;
      record({
        actor: who.ref,
        action: 'finding_approved',
        caseId,
        reason: `Approved revision ${revisionNumber} (${contentHash}).`,
        changes: [{ field: `finding ${findingId}`, from: target.status, to: 'approved' }],
      });
      record({
        actor: 'system',
        action: 'finding_became_public',
        caseId,
        reason: null,
        changes: [{ field: `finding ${findingId}`, from: 'approved', to: 'published' }],
      });
      return ok(revisions.map(clone));
    },

    async rejectRevision(findingId, revisionNumber, rationale) {
      await wait();
      const who = identity();
      if (!who || !hasPermission(who.role, 'finding:publish')) {
        return err('forbidden', 'Rejecting findings needs a moderator or administrator role.');
      }
      const target = revisions.find((r) => r.findingId === findingId && r.revisionNumber === revisionNumber);
      if (!target) return { kind: 'error', code: 'not_found' };
      if (target.status !== 'proposed' && target.status !== 'pending_second_approval') {
        return err('invalid_transition', 'This revision is not waiting for approval.');
      }
      if (rationale.trim().length < 10)
        return err('invalid_transition', 'A rejection needs a rationale of at least 10 characters.');
      if (!consumeGrant('finding.reject', findingId)) return { kind: 'error', code: 'stepup_required' };
      revisions = revisions.map((r) => (r === target ? { ...r, status: 'rejected' } : r));
      record({
        actor: who.ref,
        action: 'finding_rejected',
        caseId: target.sourceCaseId,
        reason: rationale.trim(),
        changes: [{ field: `finding ${findingId}`, from: target.status, to: 'rejected' }],
      });
      return ok(revisions.map(clone));
    },

    async getAuditLog(caseId) {
      await wait();
      const who = identity();
      if (!who || !hasPermission(who.role, 'audit:read')) {
        return err('forbidden', 'The audit history is available to administrators only.');
      }
      const entries = audit
        .filter((e) => !caseId || e.caseId === caseId)
        .sort((a, b) => b.at.localeCompare(a.at));
      return ok(entries.map(clone));
    },

    async getProfileState(slug) {
      await wait();
      const who = identity();
      if (!who || !hasPermission(who.role, 'moderation:case:read'))
        return err('forbidden', 'Staff access is required.');
      const profile = profiles.get(slug);
      return profile ? ok(clone(profile)) : { kind: 'error', code: 'not_found' };
    },
  };
  return api;
}

export const mockModerationApi = createMockModerationApi({
  cookies: () => (typeof document === 'undefined' ? '' : document.cookie),
});
