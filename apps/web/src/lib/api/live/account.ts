import { startAuthentication } from '@simplewebauthn/browser';
import {
  accountActionResultSchema,
  accountSecurityResultSchema,
  credentialIntentSchema,
  authenticationChallengeSchema,
  type AccountActionResult,
} from '@blacklist/contracts';
import type { AccountApi } from '../types';
import { request, ApiFailure } from './transport';
import { clearStepups } from './step-up';
async function action(path: string, body: unknown): Promise<AccountActionResult> {
  try {
    return await request(path, accountActionResultSchema, body);
  } catch (error) {
    const codes = [
      'invalid_credentials',
      'current_password_incorrect',
      'rate_limited',
      'session_expired',
      'reauth_required',
      'cooling_period',
      'session_not_found',
      'cannot_revoke_current_session',
      'enrollment_incomplete',
    ];
    const result = accountActionResultSchema.safeParse({
      kind: 'error',
      code:
        error instanceof ApiFailure && path === '/me/sessions/revoke' && error.code === 'not_found'
          ? 'session_not_found'
          : error instanceof ApiFailure && path === '/me/sessions/revoke' && error.code === 'conflict'
            ? 'cannot_revoke_current_session'
            : error instanceof ApiFailure && codes.includes(error.code)
              ? error.code
              : 'temporarily_unavailable',
      ...(error instanceof ApiFailure && error.code === 'rate_limited'
        ? { retryAfterSeconds: error.retryAfterSeconds }
        : {}),
    });
    return result.success ? result.data : { kind: 'error', code: 'temporarily_unavailable' };
  }
}
export const liveAccountApi: AccountApi = {
  logout: () => {
    clearStepups();
    return action('/auth/logout', {});
  },
  reauthenticate: (body) => action('/auth/reauth', body),
  async changePassword(body) {
    const own = await this.getSecurity();
    if (own.kind === 'error') return own;
    if (own.data.accountKind === 'member') {
      const fresh = await action('/auth/reauth', { password: body.currentPassword });
      if (fresh.kind === 'error')
        return fresh.code === 'invalid_credentials'
          ? { kind: 'error', code: 'current_password_incorrect' }
          : fresh;
      return action('/me/password', body);
    }
    try {
      const intent = await request('/me/staff-password/prepare', credentialIntentSchema, body);
      const challenge = await request(
        '/auth/staff/stepup/challenge',
        authenticationChallengeSchema,
        intent.action,
      );
      const response = await startAuthentication({ optionsJSON: challenge.options });
      return await action('/me/staff-password/complete', {
        intentId: intent.intentId,
        assertion: { challengeId: challenge.challengeId, response },
      });
    } catch {
      return { kind: 'error', code: 'temporarily_unavailable' };
    }
  },
  async requestEmailChange(body) {
    const own = await this.getSecurity();
    if (own.kind === 'error') return own;
    if (own.data.accountKind === 'member') return action('/me/email-change', body);
    try {
      const challenge = await request('/auth/staff/stepup/challenge', authenticationChallengeSchema, {
        action: 'account.email_change',
        targetType: 'account',
        targetId: 'me',
        parameters: body,
      });
      const response = await startAuthentication({ optionsJSON: challenge.options });
      return await action('/me/staff-email-change', {
        request: body,
        assertion: { challengeId: challenge.challengeId, response },
      });
    } catch {
      return { kind: 'error', code: 'temporarily_unavailable' };
    }
  },
  revokeSession: (sessionId) => action('/me/sessions/revoke', { sessionId }),
  revokeOtherSessions: () => action('/me/sessions/revoke', { sessionId: 'others' }),
  async getSecurity() {
    try {
      return await request('/me/security', accountSecurityResultSchema);
    } catch (error) {
      return {
        kind: 'error',
        code:
          error instanceof ApiFailure && error.code === 'session_expired'
            ? 'session_expired'
            : 'temporarily_unavailable',
      };
    }
  },
};
