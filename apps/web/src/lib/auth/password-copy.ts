/**
 * Guidance for choosing a new password (identity §3): length is the only rule.
 * No composition rules, no expiry, paste and password managers welcome.
 */
export const NEW_PASSWORD_HINT =
  'A passphrase of several words works well. No special characters are required. Paste and password managers are welcome.';

export function passwordRejectionMessage(reason: 'policy' | 'breached'): string {
  return reason === 'breached'
    ? 'Choose a different password. This one appears in a breach or common-password list.'
    : 'Choose a different password that meets the displayed length and character requirements.';
}
