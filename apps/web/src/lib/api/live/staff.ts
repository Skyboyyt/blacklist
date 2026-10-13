import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import {
  authenticationChallengeSchema,
  registrationChallengeSchema,
  passkeyResultSchema,
  enrollmentStartResultSchema,
  accountActionResultSchema,
  staffSecurityResultSchema,
  staffRecoveryStatusSchema,
  type AccountActionResult,
} from '@blacklist/contracts';
import type { StaffSecurityApi } from '../types';
import { request, ApiFailure } from './transport';
import { notConnectedStaffSecurityApi } from '../not-connected';
import { verifyLiveStepup, takeStepup } from './step-up';
// Step-up assertions must travel with the exact mutation. A standalone ceremony
// never activates authority. Admin/moderation adapters consume their pending
// assertion in the action request, rather than calling a server "grant" endpoint.
export const liveStaffSecurityApi: StaffSecurityApi = {
  ...notConnectedStaffSecurityApi,
  async getRecoveryStatus() {
    try {
      return await request('/me/staff-recovery', staffRecoveryStatusSchema.nullable());
    } catch {
      return null;
    }
  },
  async getStaffSecurity() {
    try {
      return await request('/me/staff-security', staffSecurityResultSchema);
    } catch {
      return { kind: 'error', code: 'temporarily_unavailable' };
    }
  },
  async verifyPasskey(purpose) {
    if (purpose.kind === 'step_up') return verifyLiveStepup(purpose.action, purpose.targetId);
    if (purpose.kind !== 'sign_in' || !window.PublicKeyCredential) return { kind: 'failed' };
    try {
      const challenge = await request('/auth/staff/login/challenge', authenticationChallengeSchema, {});
      const response = await startAuthentication({ optionsJSON: challenge.options });
      return await request('/auth/staff/login/assertion', passkeyResultSchema, {
        challengeId: challenge.challengeId,
        response,
      });
    } catch {
      return { kind: 'failed' };
    }
  },
  async startEnrollment(body) {
    try {
      return await request('/auth/staff/enrollment/start', enrollmentStartResultSchema, body);
    } catch {
      return { kind: 'temporarily_unavailable' };
    }
  },
  async setEnrollmentPassword(body): Promise<AccountActionResult> {
    try {
      return await request('/auth/staff/enrollment/password', accountActionResultSchema, body);
    } catch {
      return { kind: 'error', code: 'temporarily_unavailable' };
    }
  },
  async registerAuthenticator() {
    if (!window.PublicKeyCredential) return { kind: 'unsupported' };
    try {
      let challenge;
      let path = '/auth/staff/enrollment/credential';
      try {
        challenge = await request('/auth/staff/enrollment/challenge', registrationChallengeSchema, {});
      } catch (error) {
        if (!(error instanceof ApiFailure) || error.code !== 'token_invalid') throw error;
        challenge = await request('/me/staff-authenticators/challenge', registrationChallengeSchema, {});
        path = '/me/staff-authenticators/credential';
      }
      const response = await startRegistration({ optionsJSON: challenge.options });
      if (path === '/me/staff-authenticators/credential') {
        const existing = await request('/auth/staff/stepup/challenge', authenticationChallengeSchema, {
          action: 'staff.authenticator.register',
          targetType: 'account',
          targetId: 'me',
          parameters: { challengeId: challenge.challengeId, credentialId: response.id },
        });
        const proof = await startAuthentication({ optionsJSON: existing.options });
        return await request(path, passkeyResultSchema, {
          challengeId: challenge.challengeId,
          response,
          assertion: { challengeId: existing.challengeId, response: proof },
        });
      }
      return await request(path, passkeyResultSchema, { challengeId: challenge.challengeId, response });
    } catch {
      return { kind: 'failed' };
    }
  },
  async completeEnrollment(): Promise<AccountActionResult> {
    try {
      return await request('/auth/staff/enrollment/complete', accountActionResultSchema, {});
    } catch {
      return { kind: 'error', code: 'enrollment_incomplete' };
    }
  },
  async removeAuthenticator(id) {
    try {
      return await request('/me/staff-authenticators/remove', accountActionResultSchema, {
        id,
        assertion: takeStepup('staff.authenticator.remove', id),
      });
    } catch {
      return { kind: 'error', code: 'temporarily_unavailable' };
    }
  },
};
