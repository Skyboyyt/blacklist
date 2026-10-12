/**
 * Mock auth adapter (development and tests only; never in production builds).
 *
 * It decides outcomes from the email address and token prefix only. It never
 * stores, compares, logs or returns passwords, and it creates no session: a mock
 * sign-in only switches the preview viewer cookie and grants nothing. Passkey and
 * human-verification steps are simulated; nothing is verified.
 */
import type { AuthApi, HumanVerifierClient } from '../types';
import { MOCK_AUTH } from './fixtures/ids';
import { MOCK_COOKIES, currentPasskeyResult } from './scenario';

function setPreviewViewer(viewer: 'member' | 'moderator'): void {
  if (typeof document !== 'undefined')
    document.cookie = `${MOCK_COOKIES.viewer}=${viewer}; path=/; SameSite=Lax`;
}

const LATENCY_MS = 600;
const wait = () => new Promise<void>((resolve) => setTimeout(resolve, LATENCY_MS));

function tokenProblem(token: string) {
  if (token.startsWith('expired')) return { kind: 'token_problem', status: 'expired' } as const;
  if (token.startsWith('used')) return { kind: 'token_problem', status: 'used' } as const;
  if (token.startsWith('invalid')) return { kind: 'token_problem', status: 'invalid' } as const;
  if (token.startsWith('superseded')) return { kind: 'token_problem', status: 'superseded' } as const;
  if (token.startsWith('unavailable')) return { kind: 'temporarily_unavailable' } as const;
  return null;
}

export const mockAuthApi: AuthApi = {
  async login(request, next) {
    await wait();
    if (request.email === MOCK_AUTH.challengeEmail) {
      if (request.humanVerification === undefined) return { kind: 'human_verification_required' };
      setPreviewViewer('member');
      return { kind: 'signed_in', redirectTo: next };
    }
    switch (request.email) {
      case MOCK_AUTH.memberEmail:
        setPreviewViewer('member');
        return { kind: 'signed_in', redirectTo: next };
      case MOCK_AUTH.staffEmail:
        return { kind: 'staff_verification_required' };
      case MOCK_AUTH.rateLimitedEmail:
        return { kind: 'rate_limited', retryAfterSeconds: 60 };
      case MOCK_AUTH.errorEmail:
        return { kind: 'unexpected_error', requestId: 'mock-req-0001' };
      case MOCK_AUTH.unavailableEmail:
        return { kind: 'temporarily_unavailable' };
      default:
        return { kind: 'invalid_credentials' };
    }
  },
  async registerStart(request) {
    await wait();
    if (request.email === MOCK_AUTH.rateLimitedEmail) return { kind: 'rate_limited', retryAfterSeconds: 60 };
    if (request.email === MOCK_AUTH.errorEmail)
      return { kind: 'unexpected_error', requestId: 'mock-req-0002' };
    if (request.email === MOCK_AUTH.unavailableEmail) return { kind: 'temporarily_unavailable' };
    // Same response whether or not an account exists (no enumeration).
    return { kind: 'accepted' };
  },
  async registerComplete(token, form) {
    await wait();
    const problem = tokenProblem(token);
    if (problem) return problem;
    if (form.handle === MOCK_AUTH.takenHandle) return { kind: 'handle_unavailable' };
    return { kind: 'success' };
  },
  async forgotPassword(request) {
    await wait();
    if (request.email === MOCK_AUTH.rateLimitedEmail) return { kind: 'rate_limited', retryAfterSeconds: 60 };
    if (request.email === MOCK_AUTH.unavailableEmail) return { kind: 'temporarily_unavailable' };
    return { kind: 'accepted' };
  },
  async resetPassword(token, _form, options) {
    await wait();
    const problem = tokenProblem(token);
    if (problem) return problem;
    // Identity §6.3: a staff reset never succeeds on token and password alone.
    if (!token.startsWith(MOCK_AUTH.staffResetTokenPrefix)) return { kind: 'success' };
    if (!options?.withPasskey) return { kind: 'passkey_required' };
    const result = currentPasskeyResult(typeof document === 'undefined' ? '' : document.cookie);
    return result === 'verified' ? { kind: 'success' } : { kind: 'passkey_not_verified', result };
  },
  async confirmEmailChange(token) {
    await wait();
    return tokenProblem(token) ?? { kind: 'success' };
  },
};

/** Simulated challenge: always passes after a short wait. Renders nothing and verifies nothing. */
export const mockHumanVerifier: HumanVerifierClient = {
  async challenge() {
    await wait();
    return { kind: 'passed', response: 'mock-human-verification-response' };
  },
};
