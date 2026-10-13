import { recoveryCaseSchema, okEnvelopeSchema, accountActionResultSchema } from '@blacklist/contracts';
import type { ModerationApi } from '../types';
import { notConnectedModerationApi } from '../not-connected';
import { request } from './transport';
export const liveModerationApi: ModerationApi = {
  ...notConnectedModerationApi,
  async listRecoveryVerifications() {
    try {
      return await request('/mod/recoveries', okEnvelopeSchema(recoveryCaseSchema.array()));
    } catch {
      return { kind: 'error', code: 'temporarily_unavailable' };
    }
  },
  async verifyRecoveryIdentity(id, method) {
    try {
      const result = await request('/mod/recoveries/verify', accountActionResultSchema, { id, method });
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
