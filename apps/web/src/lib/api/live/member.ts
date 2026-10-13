import { profileSchema, okEnvelopeSchema, type Profile } from '@blacklist/contracts';
import type { MemberApi, MemberResult } from '../types';
import { notConnectedMemberApi } from '../not-connected';
import { request } from './transport';
async function profile(body?: unknown): Promise<MemberResult<Profile>> {
  try {
    const result = await request(
      '/me',
      okEnvelopeSchema(profileSchema),
      body,
      body === undefined ? 'GET' : 'PATCH',
    );
    return { kind: 'ok', data: result.data };
  } catch {
    return { kind: 'error', code: 'temporarily_unavailable' };
  }
}
export const liveMemberApi: MemberApi = {
  ...notConnectedMemberApi,
  getProfile: () => profile(),
  updateProfile: (body) => profile(body),
};
