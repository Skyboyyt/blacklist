import { startAuthentication, type AuthenticationResponseJSON } from '@simplewebauthn/browser';
import {
  authenticationChallengeSchema,
  passkeyResultSchema,
  invitationRequestSchema,
  roleChangeRequestSchema,
  reasonRequestSchema,
  type PasskeyResult,
} from '@blacklist/contracts';
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
    else if (['staff.recovery.approve', 'staff.recovery.complete'].includes(action)) targetType = 'recovery';
    else if (action === 'staff.authenticator.remove') targetType = 'authenticator';
    else return { kind: 'failed' };
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
