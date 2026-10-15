import { profileSchema, okEnvelopeSchema, type Profile } from '@blacklist/contracts';
import type { MemberApi, MemberResult } from '../types';
import { notConnectedMemberApi } from '../not-connected';
import { request, ApiFailure } from './transport';
async function profile(body?: unknown): Promise<MemberResult<Profile>> {
  try {
    const result = await request(
      '/me',
      okEnvelopeSchema(profileSchema),
      body,
      body === undefined ? 'GET' : 'PATCH',
    );
    return { kind: 'ok', data: result.data };
  } catch (error) {
    // api-integration-contracts §7: an ended session asks the member to sign in again.
    if (error instanceof ApiFailure && ['session_expired', 'unauthenticated'].includes(error.code))
      return { kind: 'error', code: 'sign_in_required' };
    return { kind: 'error', code: 'temporarily_unavailable' };
  }
}
export const liveMemberApi: MemberApi = {
  ...notConnectedMemberApi,
  getProfile: () => profile(),
  updateProfile: (body) => profile(body),
};
