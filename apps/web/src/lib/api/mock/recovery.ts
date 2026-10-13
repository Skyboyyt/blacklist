/**
 * Staff recovery identity verification (identity §10.11 step 2), shared by the staff and
 * administrator mock services so both enforce the same rule: two different staff members,
 * at least one an administrator, neither the subject, each recording the method used.
 */
import { recoveryVerificationSchema, type RecoveryCase, type StaffRef } from '@blacklist/contracts';
import type { ModerationResult } from '../types';
import type { MockStore } from './store';

export function addRecoveryVerification(
  store: MockStore,
  id: string,
  verifier: { readonly ref: StaffRef; readonly isAdmin: boolean },
  method: string,
  at: string,
): ModerationResult<RecoveryCase> {
  const parsed = recoveryVerificationSchema.safeParse({ method });
  if (!parsed.success)
    return { kind: 'error', code: 'invalid_transition', detail: 'Describe how identity was verified.' };
  const r = store.recoveries.find((x) => x.id === id);
  if (!r) return { kind: 'error', code: 'not_found' };
  if (r.state !== 'verifying') {
    return {
      kind: 'error',
      code: 'invalid_transition',
      detail: 'This case is not collecting verifications.',
    };
  }
  if (r.subject.id === verifier.ref.id) {
    return { kind: 'error', code: 'not_eligible', detail: 'The subject cannot verify their own identity.' };
  }
  if (r.verifications.some((v) => v.verifier.id === verifier.ref.id)) {
    return {
      kind: 'error',
      code: 'not_eligible',
      detail: 'Two different staff members must each verify identity.',
    };
  }
  const isAdmin = (staffId: string) =>
    store.staff.find((s) => s.id === staffId)?.roles.includes('admin') ?? false;
  if (
    !verifier.isAdmin &&
    r.verifications.length >= 1 &&
    !r.verifications.some((v) => isAdmin(v.verifier.id))
  ) {
    return {
      kind: 'error',
      code: 'not_eligible',
      detail: 'At least one of the two verifiers must be an administrator.',
    };
  }
  r.verifications.push({ verifier: verifier.ref, method: parsed.data.method, at });
  if (r.verifications.length >= 2) r.state = 'awaiting_approval';
  store.seq += 1;
  store.audit.push({
    id: `audit-${store.seq}`,
    at,
    actor: verifier.ref,
    action: 'staff_recovery_verified',
    caseId: null,
    reason: null,
    changes: [{ field: r.subject.handle, from: null, to: 'identity verified' }],
  });
  return { kind: 'ok', data: structuredClone(r) };
}
