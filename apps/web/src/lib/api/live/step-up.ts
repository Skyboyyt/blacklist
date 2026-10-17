import { startAuthentication, type AuthenticationResponseJSON } from '@simplewebauthn/browser';
import {
  authenticationChallengeSchema,
  passkeyResultSchema,
  invitationRequestSchema,
  roleChangeRequestSchema,
  reasonRequestSchema,
  caseDecisionSchema,
  suspensionRequestSchema,
  findingRevisionSchema,
  type PasskeyResult,
} from '@blacklist/contracts';

const positive = findingRevisionSchema.shape.revisionNumber;
import { request, ApiFailure } from './transport';
type Assertion = { challengeId: string; response: AuthenticationResponseJSON };
const pending = new Map<string, { assertion: Assertion; expiresAt: number }>();
export function takeStepup(action: string, targetId: string): Assertion {
  const key = `${action}:${targetId}`;
  const value = pending.get(key);
  pending.delete(key);
  if (!value || value.expiresAt <= Date.now()) throw new ApiFailure('stepup_required');
  return value.assertion;
}
/** Whether a confirmed step-up is waiting for this action and target. */
export function peekStepup(action: string, targetId: string): boolean {
  const value = pending.get(`${action}:${targetId}`);
  return !!value && value.expiresAt > Date.now();
}
export function clearStepups() {
  pending.clear();
}
export async function verifyLiveStepup(
  action: string,
  targetId: string,
  parameters: readonly unknown[] = [],
): Promise<PasskeyResult> {
  try {
    let targetType: string,
      params: unknown = {};
    if (action === 'staff.invite') {
      targetType = 'invitation';
      params = invitationRequestSchema.parse(parameters[0]);
    } else if (action === 'staff.role') {
      targetType = 'account';
      const r = roleChangeRequestSchema.parse(parameters[0]);
      if (r.targetId !== targetId) return { kind: 'failed' };
      params = { role: r.role, operation: r.action };
    } else if (['staff.suspend', 'staff.offboard', 'user.suspend', 'user.restore'].includes(action)) {
      targetType = 'account';
      params = reasonRequestSchema.parse({ reason: parameters[1] });
    } else if (
      action.startsWith('staff.invitation.') &&
      ['approve', 'revoke'].includes(action.split('.')[2] ?? '')
    )
      targetType = 'invitation';
    else if (action === 'staff.role.approve') targetType = 'role_request';
    else if (action === 'staff.recovery.open') targetType = 'account';
    else if (action === 'staff.recovery.object') {
      targetType = 'recovery';
      params = reasonRequestSchema.parse({ reason: parameters[1] });
    } else if (
      [
        'staff.recovery.approve',
        'staff.recovery.complete',
        'staff.recovery.withdraw',
        'staff.recovery.reopen',
      ].includes(action)
    )
      targetType = 'recovery';
    else if (action === 'staff.authenticator.remove') targetType = 'authenticator';
    else if (action.startsWith('case.')) {
      // Bound to the case, the version seen and the exact decision (parsed as the API parses it).
      targetType = 'case';
      const decision = caseDecisionSchema.parse(parameters[2]);
      if (parameters[0] !== targetId || `case.${decision.action}` !== action) return { kind: 'failed' };
      params = { version: positive.parse(parameters[1]), decision };
    } else if (action === 'finding.approve' || action === 'finding.reject') {
      targetType = 'finding';
      if (parameters[0] !== targetId) return { kind: 'failed' };
      const revisionNumber = positive.parse(parameters[1]);
      params =
        action === 'finding.approve'
          ? { revisionNumber, contentHash: findingRevisionSchema.shape.contentHash.parse(parameters[2]) }
          : { revisionNumber, rationale: suspensionRequestSchema.shape.reason.parse(parameters[2]) };
    } else if (action === 'finding.suspend') {
      targetType = 'finding';
      if (parameters[0] !== targetId) return { kind: 'failed' };
      params = suspensionRequestSchema.parse({ reason: parameters[1] });
    } else return { kind: 'failed' };
    const challenge = await request('/auth/staff/stepup/challenge', authenticationChallengeSchema, {
      action,
      targetType,
      targetId,
      parameters: params,
    });
    const response = await startAuthentication({ optionsJSON: challenge.options });
    const assertion = { challengeId: challenge.challengeId, response };
    const result = await request('/auth/staff/stepup/preview', passkeyResultSchema, assertion);
    if (result.kind === 'verified') {
      if (pending.size >= 20) pending.clear();
      pending.set(`${action}:${targetId}`, { assertion, expiresAt: Date.now() + 300000 });
    }
    return result;
  } catch {
    return { kind: 'failed' };
  }
}
