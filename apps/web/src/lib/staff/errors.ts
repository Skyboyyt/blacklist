import type { ModerationError } from '@blacklist/contracts';
import type { FormAlertState } from '@/components/auth/form-alert';

/** Plain-language alert for a staff action error. Nothing was applied in any of these cases. */
export function moderationErrorAlert(error: ModerationError): FormAlertState {
  switch (error.code) {
    case 'forbidden':
      return { kind: 'error', title: 'Your role can’t do this', message: error.detail };
    case 'not_found':
      return {
        kind: 'error',
        title: 'Case not found',
        message: 'It does not exist or is outside your review scope.',
      };
    case 'conflict':
      return { kind: 'warning', title: 'This changed while you were working', message: error.detail };
    case 'invalid_transition':
      return { kind: 'error', title: 'That decision isn’t available', message: error.detail };
    case 'not_eligible':
      return { kind: 'error', title: 'You can’t take this decision', message: error.detail };
    case 'stepup_required':
      return {
        kind: 'warning',
        title: 'Security key verification needed',
        message: 'Verify with your security key for this exact action, then try again. Nothing was changed.',
      };
    case 'evidence_unavailable':
      return { kind: 'error', title: 'Evidence isn’t ready', message: error.detail };
    case 'temporarily_unavailable':
      return {
        kind: 'warning',
        title: 'Review tools aren’t available right now',
        message: 'Nothing was changed. Try again in a few minutes.',
      };
  }
}
