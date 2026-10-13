import {
  invitationSchema,
  staffMemberSchema,
  roleRequestSchema,
  recoveryCaseSchema,
  recoveryCompletionSchema,
  invitationCreatedSchema,
  memberAccountSchema,
  adminOverviewSchema,
  accountActionResultSchema,
  okEnvelopeSchema,
  invitationIssueSchema,
  idResponseSchema,
} from '@blacklist/contracts';
import type { z } from 'zod';
import type { AdminApi, ModerationResult } from '../types';
import { notConnectedAdminApi } from '../not-connected';
import { request, ApiFailure } from './transport';
import { verifyLiveStepup, takeStepup } from './step-up';

const result = <T>(fn: () => Promise<T>): Promise<ModerationResult<T>> =>
  fn()
    .then((data) => ({ kind: 'ok' as const, data }))
    .catch((error: unknown) => {
      if (error instanceof ApiFailure && ['forbidden', 'session_expired'].includes(error.code))
        return {
          kind: 'error' as const,
          code: 'forbidden' as const,
          detail: 'An active administrator with verified WebAuthn is required.',
        };
      if (error instanceof ApiFailure && error.code === 'not_found')
        return { kind: 'error' as const, code: 'not_found' as const };
      if (
        error instanceof ApiFailure &&
        ['passkey_required', 'passkey_not_verified', 'stepup_required'].includes(error.code)
      )
        return { kind: 'error' as const, code: 'stepup_required' as const };
      return { kind: 'error' as const, code: 'temporarily_unavailable' as const };
    });
async function read<S extends z.ZodType>(path: string, schema: S): Promise<z.output<S>> {
  const envelope: unknown = await request(path, okEnvelopeSchema(schema));
  if (typeof envelope !== 'object' || envelope === null || !('data' in envelope))
    throw new ApiFailure('temporarily_unavailable');
  return schema.parse(envelope.data);
}
const staff = () => read('/admin/staff', staffMemberSchema.array());
const invitations = () => read('/admin/invitations', invitationSchema.array());
const roles = () => read('/admin/roles', roleRequestSchema.array());
const recoveries = () => read('/admin/recoveries', recoveryCaseSchema.array());
const members = () => read('/admin/members', memberAccountSchema.array());
async function mutate(path: string, body: unknown) {
  const res = await request(path, accountActionResultSchema, body);
  if (res.kind !== 'ok') throw new ApiFailure(res.code);
}
const find = <T extends { id: string }>(rows: readonly T[], id: string) => {
  const row = rows.find((row) => row.id === id);
  if (!row) throw new ApiFailure('not_found');
  return row;
};
export const liveAdminApi: AdminApi = {
  ...notConnectedAdminApi,
  verifyStepUp: verifyLiveStepup,
  getOverview: () => result(() => read('/admin/overview', adminOverviewSchema)),
  listStaff: () => result(staff),
  listInvitations: () => result(invitations),
  listRoleRequests: () => result(roles),
  listRecoveries: () => result(recoveries),
  listMembers: () => result(members),
  createInvitation: (body) =>
    result(async () => {
      const issued = await request('/admin/invitations', invitationIssueSchema, {
        request: body,
        assertion: takeStepup('staff.invite', 'new'),
      });
      return invitationCreatedSchema.parse({
        invitation: find(await invitations(), issued.invitationId),
        enrollmentCode: issued.enrollmentCode,
      });
    }),
  approveInvitation: (id) =>
    result(async () => {
      await mutate('/admin/invitations/action', {
        id,
        operation: 'approve',
        assertion: takeStepup('staff.invitation.approve', id),
      });
      return find(await invitations(), id);
    }),
  revokeInvitation: (id) =>
    result(async () => {
      await mutate('/admin/invitations/action', {
        id,
        operation: 'revoke',
        assertion: takeStepup('staff.invitation.revoke', id),
      });
      return find(await invitations(), id);
    }),
  requestRoleChange: (body) =>
    result(async () => {
      await request('/admin/roles', idResponseSchema, {
        targetId: body.targetId,
        role: body.role,
        operation: body.action,
        assertion: takeStepup('staff.role', body.targetId),
      });
      return roles();
    }),
  approveRoleRequest: (id) =>
    result(async () => {
      await mutate('/admin/roles/approve', { id, assertion: takeStepup('staff.role.approve', id) });
      return roles();
    }),
  cancelRoleRequest: (id) =>
    result(async () => {
      await mutate('/admin/roles/cancel', { id });
      return roles();
    }),
  suspendStaff: (id, reason) =>
    result(async () => {
      await mutate('/admin/staff/state', {
        id,
        reason,
        operation: 'suspend',
        assertion: takeStepup('staff.suspend', id),
      });
      return staff();
    }),
  offboardStaff: (id, reason) =>
    result(async () => {
      await mutate('/admin/staff/state', {
        id,
        reason,
        operation: 'offboard',
        assertion: takeStepup('staff.offboard', id),
      });
      return staff();
    }),
  openRecovery: (subjectId) =>
    result(async () => {
      const response = await request('/admin/recoveries', idResponseSchema, {
        subjectId,
        assertion: takeStepup('staff.recovery.open', subjectId),
      });
      return find(await recoveries(), response.id);
    }),
  verifyRecovery: (id, method) =>
    result(async () => {
      await mutate('/admin/recoveries/verify', { id, method, rationale: method });
      return find(await recoveries(), id);
    }),
  approveRecovery: (id) =>
    result(async () => {
      await mutate('/admin/recoveries/action', {
        id,
        operation: 'approve',
        assertion: takeStepup('staff.recovery.approve', id),
      });
      return find(await recoveries(), id);
    }),
  completeRecovery: (id) =>
    result(async () => {
      const verified = await verifyLiveStepup('staff.recovery.complete', id, [id]);
      if (verified.kind !== 'verified') throw new ApiFailure('stepup_required');
      const issued = await request('/admin/recoveries/action', invitationIssueSchema, {
        id,
        operation: 'complete',
        assertion: takeStepup('staff.recovery.complete', id),
      });
      return recoveryCompletionSchema.parse({
        ...find(await recoveries(), id),
        enrollmentCode: issued.enrollmentCode,
      });
    }),
  suspendMember: (id, reason) =>
    result(async () => {
      await mutate('/admin/members/state', {
        id,
        reason,
        operation: 'suspend',
        assertion: takeStepup('user.suspend', id),
      });
      return members();
    }),
  restoreMember: (id, reason) =>
    result(async () => {
      await mutate('/admin/members/state', {
        id,
        reason,
        operation: 'restore',
        assertion: takeStepup('user.restore', id),
      });
      return members();
    }),
};
