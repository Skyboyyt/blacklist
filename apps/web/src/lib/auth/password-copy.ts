import { MEMBER_PASSWORD_MIN_CODE_POINTS, PASSWORD_MIN_CODE_POINTS } from '@blacklist/contracts';

/**
 * Guidance for choosing a new password (identity §3): length is the only rule.
 * No composition rules, no expiry, paste and password managers welcome.
 */
export const NEW_PASSWORD_HINT =
  'A passphrase of several words works well. No special characters are required. Paste and password managers are welcome.';

/** The reset page does not know the account kind; the API applies the member minimum (ADR 0016). */
export const RESET_PASSWORD_HINT = `${NEW_PASSWORD_HINT} Member accounts need at least ${MEMBER_PASSWORD_MIN_CODE_POINTS} characters; staff accounts at least ${PASSWORD_MIN_CODE_POINTS}.`;

export function passwordRejectionMessage(reason: 'policy' | 'breached'): string {
  return reason === 'breached'
    ? 'Choose a different password. This one appears in a breach or common-password list.'
    : 'Choose a different password that meets the displayed length and character requirements.';
}
