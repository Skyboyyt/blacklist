/**
 * Plain-language copy for typed account/security errors. Calm and specific, but it
 * never reveals whether an email or account exists and never shows raw backend text.
 */
import type { AccountError } from '@blacklist/contracts';
import { formatDateTimeUtc } from '@/lib/format/date';

export interface ErrorCopy {
  readonly title: string;
  readonly body: string;
}

/** "about 5 minutes" — approximate on purpose: the server may extend a limit. */
export function approximateWait(seconds: number | undefined): string | null {
  if (seconds === undefined) return null;
  if (seconds < 90) return 'about a minute';
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `about ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? 'about an hour' : `about ${hours} hours`;
}

export function rateLimitCopy(retryAfterSeconds?: number): ErrorCopy {
  const wait = approximateWait(retryAfterSeconds);
  return {
    title: 'Too many attempts',
    body: wait
      ? `For your security, this is paused for now. Try again in ${wait}.`
      : 'For your security, this is paused for now. Try again a little later.',
  };
}

export const TEMPORARILY_UNAVAILABLE: ErrorCopy = {
  title: 'This isn’t available right now',
  body: 'Blacklist couldn’t complete this request. Nothing was changed. Please try again in a few minutes.',
};

export function accountErrorCopy(error: AccountError): ErrorCopy {
  switch (error.code) {
    case 'invalid_credentials':
      return { title: 'That password is incorrect', body: 'Check your password and try again.' };
    case 'current_password_incorrect':
      return {
        title: 'Your current password is incorrect',
        body: 'Nothing was changed. Check it and try again.',
      };
    case 'rate_limited':
      return rateLimitCopy(error.retryAfterSeconds);
    case 'session_expired':
      return { title: 'Your session has ended', body: 'Sign in again to continue. Nothing was changed.' };
    case 'reauth_required':
      return { title: 'Confirm it’s you', body: 'For your security, enter your password again to continue.' };
    case 'cooling_period':
      return {
        title: 'Temporarily unavailable after a password reset',
        body: error.until
          ? `To protect your account, this change is paused until ${formatDateTimeUtc(error.until)}.`
          : 'To protect your account, this change is paused for a while after a password reset.',
      };
    case 'session_not_found':
      return { title: 'That session has already ended', body: 'It no longer has access to your account.' };
    case 'cannot_revoke_current_session':
      return {
        title: 'This is your current session',
        body: 'Use Sign out to end the session you are using now.',
      };
    case 'temporarily_unavailable':
      return TEMPORARILY_UNAVAILABLE;
  }
}
