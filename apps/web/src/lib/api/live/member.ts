import {
  profileSchema,
  okEnvelopeSchema,
  memberSubmissionSummarySchema,
  memberSubmissionDetailSchema,
  memberNoticeSchema,
  appealTargetSchema,
  responseTargetSchema,
  standingChallengeSchema,
  createdIdSchema,
  type MemberError,
  type ResponseTargetRef,
} from '@blacklist/contracts';
import type { MemberApi, MemberResult } from '../types';
import { request, ApiFailure } from './transport';

// Live member adapter (api-integration-contracts §2, §4b). The API decides ownership;
// another member's submission is indistinguishable from a missing one.

const created = okEnvelopeSchema(createdIdSchema);
const detail = okEnvelopeSchema(memberSubmissionDetailSchema);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECTS_LATER = 'Project suggestions and project corrections arrive with project profiles.';

/** Maps an API refusal to the member error contract (api-integration-contracts §7). */
export function memberError(error: unknown): { readonly kind: 'error' } & MemberError {
  if (!(error instanceof ApiFailure)) return { kind: 'error', code: 'temporarily_unavailable' };
  const detailText = error.detail ?? 'This can’t be done right now.';
  switch (error.code) {
    case 'session_expired':
    case 'unauthenticated':
      return { kind: 'error', code: 'sign_in_required' };
    case 'not_found':
      return { kind: 'error', code: 'not_found' };
    case 'invalid_request':
      return {
        kind: 'error',
        code: 'invalid',
        fieldErrors: { _: 'Some fields were not accepted. Check the form and try again.' },
      };
    case 'conflict':
      return { kind: 'error', code: 'conflict', detail: detailText };
    case 'invalid_transition':
    case 'evidence_unavailable':
      return { kind: 'error', code: 'invalid_transition', detail: detailText };
    case 'forbidden':
      return {
        kind: 'error',
        code: 'invalid_transition',
        detail: 'This account can’t do this. Staff accounts don’t file member submissions.',
      };
    default:
      return { kind: 'error', code: 'temporarily_unavailable' };
  }
}

async function call<T>(run: () => Promise<{ readonly data: T }>): Promise<MemberResult<T>> {
  try {
    return { kind: 'ok', data: (await run()).data };
  } catch (error) {
    return memberError(error);
  }
}

const notFound = <T>(): Promise<MemberResult<T>> => Promise.resolve({ kind: 'error', code: 'not_found' });
const projectsLater = <T>(): Promise<MemberResult<T>> =>
  Promise.resolve({ kind: 'error', code: 'invalid_transition', detail: PROJECTS_LATER });

function addressTarget(target: ResponseTargetRef) {
  return target.kind === 'address'
    ? { kind: 'address' as const, chain: target.chain, address: target.address }
    : null;
}

export const liveMemberApi: MemberApi = {
  listSubmissions: () =>
    call(() => request('/me/submissions', okEnvelopeSchema(memberSubmissionSummarySchema.array()))),
  getSubmission: (id) => (UUID.test(id) ? call(() => request(`/me/submissions/${id}`, detail)) : notFound()),
  submitReport: (body) => call(() => request('/reports', created, body)),
  submitSuggestion: projectsLater,
  submitCorrection: projectsLater,
  submitAppeal: (body) =>
    UUID.test(body.findingId)
      ? call(() => request(`/findings/${body.findingId}/appeals`, created, body))
      : notFound(),
  respond: (id, expectedVersion, response) =>
    UUID.test(id)
      ? call(() => request(`/me/submissions/${id}/responses`, detail, { expectedVersion, response }))
      : notFound(),
  withdraw: (id, expectedVersion) =>
    UUID.test(id) ? call(() => request(`/reports/${id}/withdraw`, detail, { expectedVersion })) : notFound(),
  listNotices: () => call(() => request('/me/notifications', okEnvelopeSchema(memberNoticeSchema.array()))),
  getAppealTarget: (findingId) =>
    UUID.test(findingId)
      ? call(() => request(`/findings/${findingId}/appeal-target`, okEnvelopeSchema(appealTargetSchema)))
      : notFound(),
  getStandingChallenge: (findingId) =>
    UUID.test(findingId)
      ? call(() =>
          request(
            `/findings/${findingId}/standing-challenges`,
            okEnvelopeSchema(standingChallengeSchema),
            {},
          ),
        )
      : notFound(),
  submitResponse: (body) =>
    body.target.kind === 'address' ? call(() => request('/responses', created, body)) : projectsLater(),
  getResponseTarget: (target) => {
    const t = addressTarget(target);
    if (!t) return projectsLater();
    const query = new URLSearchParams({ chain: t.chain, address: t.address });
    return call(() =>
      request(`/responses/target?${query.toString()}`, okEnvelopeSchema(responseTargetSchema)),
    );
  },
  getResponseChallenge: (target) => {
    const t = addressTarget(target);
    if (!t) return projectsLater();
    return call(() =>
      request('/responses/standing-challenges', okEnvelopeSchema(standingChallengeSchema), t),
    );
  },
  getProfile: () => call(() => request('/me', okEnvelopeSchema(profileSchema))),
  updateProfile: (body) => call(() => request('/me', okEnvelopeSchema(profileSchema), body, 'PATCH')),
};
