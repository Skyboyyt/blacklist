import type { MemberError } from '@blacklist/contracts';
import type { FormAlertState } from '@/components/auth/form-alert';

/** Validation issues → field errors keyed by dotted path (`subjects.0.address`). */
export function issuesToErrors(
  issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join('.') || '_';
    out[key] ??= issue.message;
  }
  return out;
}

/** Plain-language alert for a member submission error. Nothing was saved in any of these cases. */
export function memberErrorAlert(error: MemberError): FormAlertState {
  switch (error.code) {
    case 'sign_in_required':
      return {
        kind: 'error',
        title: 'Sign in to continue',
        message: 'Your session has ended. Nothing was saved.',
      };
    case 'not_found':
      return {
        kind: 'error',
        title: 'Not found',
        message: 'It may have been removed, or it belongs to another account.',
      };
    case 'invalid':
      return { kind: 'error', title: 'Check the highlighted fields', message: 'Nothing was saved.' };
    case 'conflict':
      return { kind: 'warning', title: 'This changed in the meantime', message: error.detail };
    case 'invalid_transition':
      return { kind: 'error', title: 'That isn’t possible right now', message: error.detail };
    case 'temporarily_unavailable':
      return {
        kind: 'warning',
        title: 'Submissions aren’t available right now',
        message: 'Nothing was saved. Try again in a few minutes.',
      };
    case 'account_suspended':
      return {
        kind: 'error',
        title: 'Your account is suspended',
        message: 'An administrator suspended this account, so nothing can be submitted. Nothing was saved.',
      };
  }
}
