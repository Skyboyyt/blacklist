import { startAuthentication } from '@simplewebauthn/browser';
import {
  loginOutcomeSchema,
  emailAcceptedOutcomeSchema,
  tokenFlowOutcomeSchema,
  resetPasswordOutcomeSchema,
  authenticationChallengeSchema,
  type LoginOutcome,
  type EmailAcceptedOutcome,
  type TokenFlowOutcome,
  type ResetPasswordOutcome,
} from '@blacklist/contracts';
import type { AuthApi } from '../types';
import { safeNextPath } from '../../auth/safe-redirect';
import { request, ApiFailure } from './transport';
function authError(error: unknown): LoginOutcome {
  if (!(error instanceof ApiFailure)) return { kind: 'temporarily_unavailable' };
  if (error.code === 'rate_limited')
    return { kind: 'rate_limited', retryAfterSeconds: error.retryAfterSeconds };
  if (error.code === 'human_verification_required') return { kind: 'human_verification_required' };
  if (error.code === 'invalid_credentials') return { kind: 'invalid_credentials' };
  if (error.code === 'temporarily_unavailable') return { kind: 'temporarily_unavailable' };
  return { kind: 'unexpected_error', requestId: error.requestId };
}
function tokenError(error: unknown): TokenFlowOutcome {
  if (error instanceof ApiFailure && error.code === 'token_invalid')
    return { kind: 'token_problem', status: 'invalid' };
  if (error instanceof ApiFailure && error.code === 'handle_unavailable')
    return { kind: 'handle_unavailable' };
  if (error instanceof ApiFailure && error.code === 'rate_limited')
    return { kind: 'rate_limited', retryAfterSeconds: error.retryAfterSeconds };
  return error instanceof ApiFailure && error.code !== 'temporarily_unavailable'
    ? { kind: 'unexpected_error', requestId: error.requestId }
    : { kind: 'temporarily_unavailable' };
}
async function emailRequest(path: string, body: unknown): Promise<EmailAcceptedOutcome> {
  try {
    return await request(path, emailAcceptedOutcomeSchema, body);
  } catch (error) {
    if (error instanceof ApiFailure && error.code === 'rate_limited')
      return { kind: 'rate_limited', retryAfterSeconds: error.retryAfterSeconds };
    return { kind: 'temporarily_unavailable' };
  }
}
export const liveAuthApi: AuthApi = {
  async login(body, next) {
    try {
      const result = await request('/auth/login', loginOutcomeSchema, body);
      return result.kind === 'signed_in' ? { ...result, redirectTo: safeNextPath(next) } : result;
    } catch (error) {
      return authError(error);
    }
  },
  registerStart: (body) => emailRequest('/auth/register/start', body),
  forgotPassword: (body) => emailRequest('/auth/password/forgot', body),
  async registerComplete(token, form) {
    try {
      return await request('/auth/register/complete', tokenFlowOutcomeSchema, { token, form });
    } catch (error) {
      return tokenError(error);
    }
  },
  async confirmEmailChange(token) {
    try {
      return await request('/auth/email-change/confirm', tokenFlowOutcomeSchema, { token });
    } catch (error) {
      return tokenError(error);
    }
  },
  async resetPassword(token, form, options): Promise<ResetPasswordOutcome> {
    try {
      let assertion;
      if (options?.withPasskey) {
        if (!window.PublicKeyCredential) return { kind: 'passkey_not_verified', result: 'unsupported' };
        const challenge = await request('/auth/password/reset/challenge', authenticationChallengeSchema, {
          token,
        });
        try {
          assertion = {
            challengeId: challenge.challengeId,
            response: await startAuthentication({ optionsJSON: challenge.options }),
          };
        } catch {
          return { kind: 'passkey_not_verified', result: 'cancelled' };
        }
      }
      return await request('/auth/password/reset', resetPasswordOutcomeSchema, {
        token,
        form,
        ...(assertion ? { assertion } : {}),
      });
    } catch (error) {
      if (error instanceof ApiFailure && error.code === 'passkey_required')
        return { kind: 'passkey_required' };
      if (error instanceof ApiFailure && error.code === 'passkey_not_verified')
        return { kind: 'passkey_not_verified', result: 'failed' };
      const result = tokenError(error);
      return result.kind === 'handle_unavailable' ? { kind: 'temporarily_unavailable' } : result;
    }
  },
};
