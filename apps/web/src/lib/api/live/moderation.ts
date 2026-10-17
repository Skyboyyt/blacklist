import {
  recoveryCaseSchema,
  okEnvelopeSchema,
  accountActionResultSchema,
  queueResponseSchema,
  caseDetailSchema,
  findingRevisionSchema,
  staffFindingSchema,
  findingHistorySchema,
  type ModerationError,
} from '@blacklist/contracts';
import type { ModerationApi, ModerationResult } from '../types';
import { notConnectedModerationApi } from '../not-connected';
import { request, ApiFailure } from './transport';
import { takeStepup, peekStepup, verifyLiveStepup } from './step-up';

// Live staff review adapter (api-integration-contracts §3, §4b). The API re-checks role,
// state, assignment, version and independence; the UI hiding a button is never the guard.

const caseDetail = okEnvelopeSchema(caseDetailSchema);
const revisions = okEnvelopeSchema(findingRevisionSchema.array());
const history = okEnvelopeSchema(findingHistorySchema);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Maps an API refusal to the moderation error contract. */
export function moderationError(error: unknown): { readonly kind: 'error' } & ModerationError {
  if (!(error instanceof ApiFailure)) return { kind: 'error', code: 'temporarily_unavailable' };
  const detail = error.detail ?? 'This can’t be done right now.';
  switch (error.code) {
    case 'not_found':
      return { kind: 'error', code: 'not_found' };
    case 'stepup_required':
      return { kind: 'error', code: 'stepup_required' };
    case 'conflict':
      return { kind: 'error', code: 'conflict', detail, currentVersion: error.currentVersion ?? 1 };
    case 'invalid_transition':
    case 'not_eligible':
    case 'evidence_unavailable':
      return { kind: 'error', code: error.code, detail };
    case 'forbidden':
      return { kind: 'error', code: 'forbidden', detail: error.detail ?? 'Your role cannot do this.' };
    case 'session_expired':
    case 'unauthenticated':
      return {
        kind: 'error',
        code: 'forbidden',
        detail: 'Your staff session ended. Sign in again and confirm with a passkey.',
      };
    case 'invalid_request':
      return {
        kind: 'error',
        code: 'invalid_transition',
        detail: 'The request was not accepted. Reload and try again.',
      };
    default:
      return { kind: 'error', code: 'temporarily_unavailable' };
  }
}

async function call<T>(run: () => Promise<{ readonly data: T }>): Promise<ModerationResult<T>> {
  try {
    return { kind: 'ok', data: (await run()).data };
  } catch (error) {
    return moderationError(error);
  }
}

const notFound = <T>(): Promise<ModerationResult<T>> => Promise.resolve({ kind: 'error', code: 'not_found' });
const unavailable = <T>(): Promise<ModerationResult<T>> =>
  Promise.resolve({ kind: 'error', code: 'temporarily_unavailable' });

export const liveModerationApi: ModerationApi = {
  ...notConnectedModerationApi,
  getQueue: (q) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(q))
      if (value !== undefined && value !== '') query.set(key, String(value));
    return call(() => request(`/mod/queue?${query.toString()}`, okEnvelopeSchema(queueResponseSchema)));
  },
  getCase: (id) => (UUID.test(id) ? call(() => request(`/mod/cases/${id}`, caseDetail)) : notFound()),
  assign: (id, expectedVersion, target) =>
    UUID.test(id)
      ? call(() =>
          request(`/mod/cases/${id}/assignment`, caseDetail, {
            expectedVersion,
            to: target.to,
            ...(target.takeOver ? { takeOver: true } : {}),
          }),
        )
      : notFound(),
  addNote: (id, expectedVersion, text) =>
    UUID.test(id)
      ? call(() => request(`/mod/cases/${id}/notes`, caseDetail, { expectedVersion, text }))
      : notFound(),
  verifyStepUp: (action, targetId, parameters) => verifyLiveStepup(action, targetId, parameters),
  decide: (id, expectedVersion, decision) => {
    if (!UUID.test(id)) return notFound();
    // Decisions that need a step-up carry the assertion confirmed for this exact decision.
    const assertion = peekStepup(`case.${decision.action}`, id)
      ? takeStepup(`case.${decision.action}`, id)
      : undefined;
    return call(() =>
      request(`/mod/cases/${id}/decisions`, caseDetail, {
        expectedVersion,
        decision,
        ...(assertion ? { assertion } : {}),
      }),
    );
  },
  listRevisions: () => call(() => request('/mod/approvals', revisions)),
  approveRevision: (findingId, revisionNumber, contentHash) =>
    call(() =>
      request(`/mod/findings/${findingId}/approvals`, revisions, {
        event: 'approve',
        revisionNumber,
        contentHash,
        assertion: takeStepup('finding.approve', findingId),
      }),
    ),
  rejectRevision: (findingId, revisionNumber, rationale) =>
    call(() =>
      request(`/mod/findings/${findingId}/approvals`, revisions, {
        event: 'reject',
        revisionNumber,
        rationale,
        assertion: takeStepup('finding.reject', findingId),
      }),
    ),
  // Audit search and project profiles arrive with Phase 10; case history is in the case detail.
  getAuditLog: unavailable,
  getProfileState: unavailable,
  listFindings: () => call(() => request('/mod/findings', okEnvelopeSchema(staffFindingSchema.array()))),
  suspendFinding: (findingId, reason) =>
    UUID.test(findingId)
      ? call(() =>
          request(`/mod/findings/${findingId}/suspend`, caseDetail, {
            reason,
            assertion: takeStepup('finding.suspend', findingId),
          }),
        )
      : notFound(),
  getFindingHistory: (findingId) =>
    UUID.test(findingId) ? call(() => request(`/mod/findings/${findingId}/revisions`, history)) : notFound(),
  proposeRevision: (findingId, base, draft) =>
    UUID.test(findingId)
      ? call(() => request(`/mod/findings/${findingId}/revisions`, history, { base, draft }))
      : notFound(),
  async listRecoveryVerifications() {
    try {
      return await request('/mod/recoveries', okEnvelopeSchema(recoveryCaseSchema.array()));
    } catch {
      return { kind: 'error', code: 'temporarily_unavailable' };
    }
  },
  async verifyRecoveryIdentity(id, method, rationale) {
    try {
      const result = await request('/mod/recoveries/verify', accountActionResultSchema, {
        id,
        method,
        rationale,
      });
      if (result.kind !== 'ok') return { kind: 'error', code: 'temporarily_unavailable' };
      const cases = await this.listRecoveryVerifications();
      if (cases.kind === 'error') return cases;
      const data = cases.data.find((r) => r.id === id);
      return data ? { kind: 'ok', data } : { kind: 'error', code: 'not_found' };
    } catch {
      return { kind: 'error', code: 'temporarily_unavailable' };
    }
  },
};
