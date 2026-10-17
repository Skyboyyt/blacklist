import { DomainError } from '@blacklist/domain';

/**
 * A safe reason for a failed operator command. Domain refusal codes are fixed words;
 * anything else may carry connection details, so only its category is named.
 */
export function operatorFailureReason(error: unknown): string {
  if (error instanceof DomainError) return error.code;
  if (error instanceof Error && error.message === 'runtime_database_role_rejected')
    return 'database_role_rejected';
  return 'unavailable (database unreachable or asleep: retry once)';
}
