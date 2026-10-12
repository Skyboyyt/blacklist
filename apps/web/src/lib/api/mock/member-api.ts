/**
 * Mock member submission service (development and tests only; never in production builds).
 *
 * Creates private cases in the shared demo store, so staff see them in their queue and
 * the member sees their own status. Views returned here are member-private: they never
 * include internal notes, internal rationales or staff identities. Evidence is metadata
 * only: no file is uploaded, stored or scanned in the demo. Simulated standing checks
 * are labelled as simulated.
 */
import {
  appealRequestSchema,
  correctionRequestSchema,
  infoResponseSchema,
  reportRequestSchema,
  suggestionRequestSchema,
  type AuditEntry,
  type CaseDetail,
  type EvidenceFile,
  type MemberSubmissionDetail,
  type MemberSubmissionSummary,
  type ProfileChange,
  type StaffEvidence,
  type SubmissionKind,
} from '@blacklist/contracts';
import { defangUrl } from '@/lib/format/address';
import type { MemberApi, MemberResult } from '../types';
import { clearAppeal, markUnderAppeal } from './public-effects';
import { currentViewerKey } from './scenario';
import { VIEWER_FIXTURES } from './fixtures/dashboard';
import { createStore, nextId, type MockStore } from './store';

export interface MockMemberOptions {
  readonly cookies: () => string;
  readonly now?: () => Date;
  readonly latencyMs?: number;
  readonly store?: MockStore;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const STATUS_LABEL: Readonly<Record<string, string>> = {
  submitted: 'Submitted',
  screening: 'Being checked',
  queued: 'Waiting for review',
  in_review: 'In review',
  needs_info: 'Information requested',
  needs_information: 'Information requested',
  accepted: 'Accepted',
  rejected: 'Not accepted',
  rejected_abusive: 'Not accepted',
  withdrawn: 'Withdrawn',
  upheld: 'Decided: finding upheld',
  amended: 'Decided: finding amended',
  reversed: 'Decided: finding reversed',
  accepted_into_profile: 'Accepted: profile published',
  not_accepted: 'Not accepted',
};
const KIND_OF: Readonly<Record<CaseDetail['type'], SubmissionKind>> = {
  report_review: 'report',
  project_suggestion: 'project_suggestion',
  correction_request: 'correction',
  appeal_review: 'appeal',
};
const WITHDRAWABLE: Readonly<Partial<Record<CaseDetail['type'], readonly string[]>>> = {
  report_review: ['submitted', 'screening', 'queued', 'in_review', 'needs_info'],
  appeal_review: ['submitted', 'in_review'],
};

interface Issues {
  readonly issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[];
}

function fieldErrors(error: Issues): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.') || '_';
    out[key] ??= issue.message;
  }
  return out;
}

const invalid = <T>(error: Issues): MemberResult<T> => ({
  kind: 'error',
  code: 'invalid',
  fieldErrors: fieldErrors(error),
});

export function createMockMemberApi(options: MockMemberOptions): MemberApi {
  const now = options.now ?? (() => new Date());
  const latency = options.latencyMs ?? 300;
  const wait = () => (latency > 0 ? new Promise<void>((r) => setTimeout(r, latency)) : Promise.resolve());
  const store = options.store ?? createStore();
  const at = () => now().toISOString();
  const due = (days: number) => new Date(now().getTime() + days * DAY_MS).toISOString();

  function handle(): string | null {
    const viewer = VIEWER_FIXTURES[currentViewerKey(options.cookies())];
    return viewer.kind === 'signed_in' ? viewer.handle : null;
  }

  function record(caseId: string, action: AuditEntry['action'], changes: AuditEntry['changes'] = []): void {
    store.seq += 1;
    store.audit.push({
      id: `audit-${store.seq}`,
      at: at(),
      actor: 'system',
      action,
      caseId,
      reason: null,
      changes,
    });
  }

  function notify(owner: string, text: string, href: string): void {
    store.seq += 1;
    store.notices.unshift({ handle: owner, id: `notice-${store.seq}`, text, at: at(), href });
  }

  function images(
    files: readonly EvidenceFile[],
    prefix: string,
    by: StaffEvidence['submittedBy'],
  ): StaffEvidence[] {
    return files.map((f, i) => ({
      id: `${prefix}-ev${i + 1}`,
      kind: 'image',
      description: f.name,
      submittedBy: by,
      submittedAt: at(),
      state: 'available',
      visibility: 'staff_only',
      stateNote: 'Demo: only the file name, type and size were recorded. No file was uploaded or scanned.',
      derivative: { width: 1280, height: 720 },
    }));
  }

  const base = (id: string, title: string, slaDays: number) => ({
    id,
    title,
    assignedTo: null,
    submittedAt: at(),
    lastActivityAt: at(),
    slaDueAt: due(slaDays),
    version: 1,
    notes: [],
    history: [],
    assessment: null,
    submitterReason: null,
    publicSummary: null,
    infoRequest: null,
    submitterMessages: [],
  });

  function hrefFor(c: CaseDetail): string {
    switch (c.type) {
      case 'report_review':
        return `/reports/${c.id}`;
      case 'project_suggestion':
        return `/projects/suggestions/${c.id}`;
      case 'appeal_review':
        return `/appeals/${c.id}`;
      case 'correction_request':
        return `/corrections/${c.id}`;
    }
  }

  function created(c: CaseDetail, owner: string, text: string): MemberResult<{ id: string }> {
    store.cases.set(c.id, c);
    store.owners.set(c.id, owner);
    record(c.id, 'case_created');
    notify(owner, text, hrefFor(c));
    return { kind: 'ok', data: { id: c.id } };
  }

  function owned(id: string): CaseDetail | null {
    const me = handle();
    const c = store.cases.get(id);
    return c && me && store.owners.get(id) === me ? c : null;
  }

  function summaryOf(c: CaseDetail): MemberSubmissionSummary {
    return {
      id: c.id,
      kind: KIND_OF[c.type],
      title: c.title,
      status: STATUS_LABEL[c.status] ?? c.status,
      submittedAt: c.submittedAt,
      updatedAt: c.lastActivityAt,
      needsAction:
        c.status === 'needs_info' ||
        c.status === 'needs_information' ||
        (c.type === 'appeal_review' && c.standing.outcome === 'denied'),
    };
  }

  function detailsOf(c: CaseDetail): { label: string; value: string }[] {
    const subject =
      c.subject.kind === 'address' ? `${c.subject.chain}: ${c.subject.address}` : `Project ${c.subject.name}`;
    switch (c.type) {
      case 'report_review':
        return [
          { label: 'Subject', value: subject },
          { label: 'What happened', value: c.narrative },
        ];
      case 'project_suggestion':
        return [
          { label: 'Project', value: c.proposal.name },
          { label: 'Network and address', value: `${c.proposal.chain}: ${c.proposal.identifier}` },
          { label: 'Official links (never opened by Blacklist)', value: c.proposal.links.join('\n') },
          { label: 'Description', value: c.proposal.description },
          { label: 'Your connection to the project', value: c.proposal.relationship },
        ];
      case 'correction_request':
        return [
          { label: 'Profile', value: subject },
          { label: 'Your explanation', value: c.statement },
          ...c.changes.map((ch) => ({
            label: ch.label,
            value: `${ch.current ?? 'none'} → ${ch.proposed ?? 'removed'}`,
          })),
        ];
      case 'appeal_review':
        return [
          { label: 'Finding', value: `${c.appealedDecision.findingId}: ${c.appealedDecision.publicSummary}` },
          { label: 'Your grounds', value: c.grounds },
          {
            label: 'Standing',
            value: `${c.standing.mechanism}: ${c.standing.outcome}. ${c.standing.scopeStatement}`,
          },
        ];
    }
  }

  /** Member-visible timeline: no staff identities, notes, assignments or internal reasons. */
  function timelineOf(c: CaseDetail): { at: string; label: string }[] {
    const labels: { at: string; label: string }[] = [];
    for (const e of store.audit.filter((a) => a.caseId === c.id).sort((a, b) => a.at.localeCompare(b.at))) {
      if (e.action === 'case_created') labels.push({ at: e.at, label: 'Submitted' });
      else if (e.action === 'info_requested')
        labels.push({ at: e.at, label: 'Staff asked for more information' });
      else if (
        e.action === 'case_status_changed' ||
        e.action === 'appeal_decided' ||
        e.action === 'correction_decided'
      ) {
        const status = e.changes.find((ch) => ch.field === 'status')?.to;
        const standing = e.changes.find((ch) => ch.field === 'standing')?.to;
        if (status) labels.push({ at: e.at, label: `Status: ${STATUS_LABEL[status] ?? status}` });
        if (standing) labels.push({ at: e.at, label: `Standing ${standing}` });
        if (e.changes.some((ch) => ch.field === 'reply')) labels.push({ at: e.at, label: 'You replied' });
      } else if (e.action === 'profile_revised')
        labels.push({ at: e.at, label: 'The public profile was updated' });
    }
    return labels;
  }

  function evidenceOf(c: CaseDetail): string[] {
    return c.evidence
      .filter((e) => e.kind === 'image' && e.submittedBy !== 'staff')
      .map((e) => e.description);
  }

  function publicLinkOf(c: CaseDetail): string | null {
    if (c.type === 'project_suggestion') return c.resultingSlug ? `/project/${c.resultingSlug}` : null;
    if (c.type === 'correction_request')
      return c.status === 'accepted' && c.subject.kind === 'project' ? `/project/${c.subject.slug}` : null;
    if (c.type === 'appeal_review' && c.subject.kind === 'address')
      return `/address/${c.subject.chain}/${c.subject.address}`;
    return null;
  }

  function detailOf(c: CaseDetail): MemberSubmissionDetail {
    const withdrawable = WITHDRAWABLE[c.type]?.includes(c.status) ?? false;
    return {
      ...summaryOf(c),
      version: c.version,
      details: detailsOf(c),
      evidenceNames: evidenceOf(c),
      timeline: timelineOf(c),
      infoRequest: c.status === 'needs_info' || c.status === 'needs_information' ? c.infoRequest : null,
      submitterReason: c.submitterReason,
      publicOutcome: c.publicSummary,
      publicLink: publicLinkOf(c),
      canRespond: summaryOf(c).needsAction,
      canWithdraw: withdrawable,
    };
  }

  const signIn = { kind: 'error', code: 'sign_in_required' } as const;

  return {
    async listSubmissions() {
      await wait();
      const me = handle();
      if (!me) return signIn;
      const mine = [...store.cases.values()].filter((c) => store.owners.get(c.id) === me);
      return {
        kind: 'ok',
        data: mine.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt)).map(summaryOf),
      };
    },

    async getSubmission(id) {
      await wait();
      if (!handle()) return signIn;
      const c = owned(id);
      return c ? { kind: 'ok', data: detailOf(c) } : { kind: 'error', code: 'not_found' };
    },

    async submitReport(request) {
      await wait();
      const me = handle();
      if (!me) return signIn;
      const parsed = reportRequestSchema.safeParse(request);
      if (!parsed.success) return invalid(parsed.error);
      const r = parsed.data;
      const id = nextId(store, 'RPT');
      const first = r.subjects[0];
      if (!first)
        return { kind: 'error', code: 'invalid', fieldErrors: { subjects: 'Add at least one address.' } };
      const address = first.chain === 'ethereum' ? first.address.toLowerCase() : first.address;
      const evidence: StaffEvidence[] = [
        ...images(r.evidence, id, 'reporter'),
        ...r.txRefs.map((t, i) => ({
          id: `${id}-tx${i + 1}`,
          kind: 'transaction_ref' as const,
          description: 'Transaction reference from the reporter',
          submittedBy: 'reporter' as const,
          submittedAt: at(),
          state: 'available' as const,
          visibility: 'staff_only' as const,
          stateNote: 'Demo: not verified against chain data.',
          chain: t.chain,
          txHash: t.chain === 'ethereum' ? t.hash.toLowerCase() : t.hash,
          verification: 'pending' as const,
        })),
        ...r.urls.map((u, i) => ({
          id: `${id}-url${i + 1}`,
          kind: 'url' as const,
          description: 'Link from the reporter',
          submittedBy: 'reporter' as const,
          submittedAt: at(),
          state: 'available' as const,
          visibility: 'staff_only' as const,
          stateNote: 'Stored as text and never fetched.',
          defangedUrl: defangUrl(u),
        })),
      ];
      const others = r.subjects.slice(1).map((s) => `${s.chain}: ${s.address}`);
      const narrative = [
        r.narrative,
        `Incident date: ${r.incidentDate}.`,
        r.lossAmount ? `Reported loss: ${r.lossAmount} ${r.lossAsset ?? ''}`.trim() : '',
        others.length > 0 ? `Other addresses: ${others.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      // The real pipeline runs automated screening first (submitted → screening → queued).
      return created(
        {
          ...base(id, r.title, 4),
          type: 'report_review',
          status: 'queued',
          category: r.category,
          subject: { kind: 'address', chain: first.chain, address, displayAddress: address },
          chain: first.chain,
          reporterRef: `Reporter ${me === 'demo_member' ? 'R-1000' : 'R-1001'}`,
          narrative,
          evidence,
        },
        me,
        `Your report “${r.title}” was received. It is private and has no public effect until staff review it.`,
      );
    },

    async submitSuggestion(request) {
      await wait();
      const me = handle();
      if (!me) return signIn;
      const parsed = suggestionRequestSchema.safeParse(request);
      if (!parsed.success) return invalid(parsed.error);
      const s = parsed.data;
      const id = nextId(store, 'SUG');
      const identifier = s.chain === 'ethereum' ? s.identifier.toLowerCase() : s.identifier;
      return created(
        {
          ...base(id, `Suggest project: ${s.name}`, 7),
          type: 'project_suggestion',
          status: 'submitted',
          subject: { kind: 'project', slug: `suggested-${id.toLowerCase()}`, name: s.name },
          chain: s.chain,
          submitterRef: `Submitter ${me === 'demo_member' ? 'S-1000' : 'S-1001'}`,
          proposal: {
            name: s.name,
            category: s.category,
            chain: s.chain,
            identifier,
            links: s.links.map(defangUrl),
            description: s.description,
            relationship: s.relationship,
          },
          resultingSlug: null,
          evidence: images(s.evidence, id, 'requester'),
        },
        me,
        `Your project suggestion “${s.name}” was received. It is private until staff publish a profile.`,
      );
    },

    async submitCorrection(request) {
      await wait();
      const me = handle();
      if (!me) return signIn;
      const parsed = correctionRequestSchema.safeParse(request);
      if (!parsed.success) return invalid(parsed.error);
      const r = parsed.data;
      const project = store.projects.find((p) => p.slug === r.projectSlug);
      if (!project) return { kind: 'error', code: 'not_found' };
      const changes: ProfileChange[] = [];
      if (r.description)
        changes.push({
          field: 'description',
          label: 'Description',
          current: project.description,
          proposed: r.description,
        });
      if (r.addDomain)
        changes.push({
          field: 'domain_added',
          label: 'Official domain added',
          current: null,
          proposed: r.addDomain,
        });
      if (r.retireDomain) {
        if (!project.domains.some((d) => d.hostname === r.retireDomain)) {
          return {
            kind: 'error',
            code: 'invalid',
            fieldErrors: { retireDomain: 'That domain is not listed on this profile.' },
          };
        }
        changes.push({
          field: 'domain_retired',
          label: 'Official domain retired',
          current: r.retireDomain,
          proposed: null,
        });
      }
      const id = nextId(store, 'COR');
      return created(
        {
          ...base(id, `Correction: ${project.name}`, 7),
          type: 'correction_request',
          status: 'submitted',
          subject: { kind: 'project', slug: project.slug, name: project.name },
          chain: null,
          requesterRef: `Requester ${me === 'demo_member' ? 'Q-1000' : 'Q-1001'}`,
          statement: r.statement,
          currentRevision: project.profileRevision,
          changes,
          evidence: images(r.evidence, id, 'requester'),
        },
        me,
        `Your correction request for ${project.name} was received.`,
      );
    },

    async submitAppeal(request) {
      await wait();
      const me = handle();
      if (!me) return signIn;
      const parsed = appealRequestSchema.safeParse(request);
      if (!parsed.success) return invalid(parsed.error);
      const r = parsed.data;
      const address = store.addresses.find((a) => a.findings.some((f) => f.id === r.findingId));
      const finding = address?.findings.find((f) => f.id === r.findingId);
      const participants = store.findingParticipants.get(r.findingId);
      if (!address || !finding || !participants) return { kind: 'error', code: 'not_found' };
      const open = [...store.cases.values()].some(
        (c) =>
          c.type === 'appeal_review' &&
          c.appealedDecision.findingId === r.findingId &&
          store.owners.get(c.id) === me &&
          ['submitted', 'in_review'].includes(c.status),
      );
      if (open)
        return {
          kind: 'error',
          code: 'conflict',
          detail: 'You already have an open appeal against this finding.',
        };
      const id = nextId(store, 'APL');
      const s = r.standing;
      const standing =
        s.mechanism === 'documentary'
          ? {
              mechanism: 'documentary' as const,
              outcome: 'pending' as const,
              scopeStatement: s.explanation,
              decidedAt: at(),
            }
          : {
              mechanism: s.mechanism === 'signature' ? ('signature' as const) : ('dns_txt' as const),
              outcome: 'granted' as const,
              scopeStatement:
                s.mechanism === 'signature'
                  ? 'SIMULATED in the demo: a fresh signature would prove control of the address at signing time only.'
                  : `SIMULATED in the demo: a DNS TXT check on ${s.domain} would prove control of the domain at check time only.`,
              decidedAt: at(),
            };
      markUnderAppeal(store, r.findingId, at());
      return created(
        {
          ...base(id, `Appeal: ${finding.title}`, 14),
          type: 'appeal_review',
          status: 'submitted',
          subject: {
            kind: 'address',
            chain: address.chain,
            address: address.address,
            displayAddress: address.displayAddress,
          },
          chain: address.chain,
          appellantRef: `Appellant ${me === 'demo_member' ? 'A-1000' : 'A-1001'}`,
          appealedDecision: {
            findingId: r.findingId,
            revisionNumber: 1,
            severity:
              participants.severity === 'severe'
                ? 'severe'
                : participants.severity === 'high'
                  ? 'high'
                  : participants.severity === 'medium'
                    ? 'medium'
                    : 'low',
            publicSummary: finding.summary,
            author: participants.author,
            approver: participants.approver,
            publishedAt: finding.publishedAt,
          },
          grounds: r.grounds,
          standing,
          evidence: s.mechanism === 'documentary' ? images(s.evidence, id, 'appellant') : [],
        },
        me,
        `Your appeal was received. The finding now shows “Disputed — under appeal” while it is reviewed.`,
      );
    },

    async respond(id, expectedVersion, response) {
      await wait();
      if (!handle()) return signIn;
      const c = owned(id);
      if (!c) return { kind: 'error', code: 'not_found' };
      if (c.version !== expectedVersion) {
        return {
          kind: 'error',
          code: 'conflict',
          detail: 'This submission changed since you opened it. Reload to see the latest status.',
        };
      }
      const parsed = infoResponseSchema.safeParse(response);
      if (!parsed.success) return invalid(parsed.error);
      const reopen: Readonly<Record<string, string>> = {
        needs_info: 'in_review',
        needs_information: 'submitted',
      };
      const deniedStanding = c.type === 'appeal_review' && c.standing.outcome === 'denied';
      const next = reopen[c.status];
      if (!next && !deniedStanding) {
        return {
          kind: 'error',
          code: 'invalid_transition',
          detail: 'Staff are not waiting for information on this submission.',
        };
      }
      const from = c.status;
      c.submitterMessages.push({ at: at(), text: parsed.data.message });
      c.evidence.push(
        ...images(
          parsed.data.evidence,
          `${id}-r${c.submitterMessages.length}`,
          c.type === 'appeal_review' ? 'appellant' : 'requester',
        ),
      );
      if (next) Object.assign(c, { status: next });
      if (deniedStanding && c.type === 'appeal_review') c.standing = { ...c.standing, outcome: 'pending' };
      c.infoRequest = null;
      c.version += 1;
      c.lastActivityAt = at();
      record(id, 'case_status_changed', [
        { field: 'reply', from: null, to: 'submitter replied' },
        ...(next ? [{ field: 'status', from, to: next }] : []),
      ]);
      return { kind: 'ok', data: detailOf(c) };
    },

    async withdraw(id, expectedVersion) {
      await wait();
      if (!handle()) return signIn;
      const c = owned(id);
      if (!c) return { kind: 'error', code: 'not_found' };
      if (c.version !== expectedVersion) {
        return {
          kind: 'error',
          code: 'conflict',
          detail: 'This submission changed since you opened it. Reload to see the latest status.',
        };
      }
      if (!(WITHDRAWABLE[c.type]?.includes(c.status) ?? false)) {
        return {
          kind: 'error',
          code: 'invalid_transition',
          detail: 'A decision was already recorded, so this can no longer be withdrawn.',
        };
      }
      const from = c.status;
      Object.assign(c, { status: 'withdrawn' });
      if (c.type === 'appeal_review') clearAppeal(store, c.appealedDecision.findingId);
      c.version += 1;
      c.lastActivityAt = at();
      record(id, 'case_status_changed', [{ field: 'status', from, to: 'withdrawn' }]);
      return { kind: 'ok', data: detailOf(c) };
    },

    async listNotices() {
      await wait();
      const me = handle();
      if (!me) return signIn;
      return {
        kind: 'ok',
        data: store.notices.filter((n) => n.handle === me).map(({ handle: _h, ...n }) => n),
      };
    },

    async getAppealTarget(findingId) {
      await wait();
      const me = handle();
      if (!me) return signIn;
      const address = store.addresses.find((a) => a.findings.some((f) => f.id === findingId));
      const finding = address?.findings.find((f) => f.id === findingId);
      if (!address || !finding || !store.findingParticipants.has(findingId))
        return { kind: 'error', code: 'not_found' };
      const alreadyAppealed = [...store.cases.values()].some(
        (c) =>
          c.type === 'appeal_review' &&
          c.appealedDecision.findingId === findingId &&
          store.owners.get(c.id) === me &&
          ['submitted', 'in_review'].includes(c.status),
      );
      return {
        kind: 'ok',
        data: {
          findingId,
          title: finding.title,
          summary: finding.summary,
          subject: { chain: address.chain, address: address.address },
          disputeState: finding.disputeState,
          alreadyAppealed,
        },
      };
    },

    async getStandingChallenge(findingId) {
      await wait();
      if (!handle()) return signIn;
      const address = store.addresses.find((a) => a.findings.some((f) => f.id === findingId));
      if (!address) return { kind: 'error', code: 'not_found' };
      store.seq += 1;
      const nonce = `demo${String(store.seq).padStart(8, '0')}`;
      return {
        kind: 'ok',
        data: {
          message: [
            'blacklist.example wants you to prove control of this address.',
            `Address: ${address.displayAddress}`,
            `Network: ${address.chain}`,
            `Purpose: standing for an appeal on finding ${findingId}`,
            'This signature does not authorize any transaction or token approval and costs nothing.',
            `Nonce: ${nonce}`,
            'Expires: 10 minutes after issue',
          ].join('\n'),
        },
      };
    },
  };
}
