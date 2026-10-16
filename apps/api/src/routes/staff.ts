import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  enrollmentStartSchema,
  enrollmentPasswordRequestSchema,
  staffSecuritySchema,
  invitationRequestSchema,
  invitationSchema,
  staffMemberSchema,
  passwordChangeFormSchema,
  emailChangeRequestSchema,
  adminOverviewSchema,
  roleRequestSchema,
  recoveryCaseSchema,
  memberAccountSchema,
  staffRecoveryStatusSchema,
} from '@blacklist/contracts';
import {
  authenticationChallenge,
  assureSession,
  previewStepup,
  startEnrollment,
  setEnrollmentPassword,
  enrollmentChallenge,
  enrollAuthenticator,
  completeEnrollment,
  inviteStaff,
  approveInvitation,
  revokeInvitation,
  suspendAccount,
  offboardStaff,
  requestRole,
  approveRole,
  openRecovery,
  verifyRecoveryIdentity,
  approveRecovery,
  completeRecovery,
  objectRecovery,
  withdrawRecoveryObjection,
  reopenRecovery,
  staffSecurity,
  listStaff,
  listInvitations,
  staffAdministration,
  cancelRoleRequest,
  recoveryVerificationCases,
  ownRecoveryStatus,
  removeAuthenticator,
  replacementChallenge,
  registerReplacement,
  prepareStaffPasswordChange,
  changeStaffPassword,
  requestStaffEmailChange,
  DomainError,
  type IdentityContext,
} from '@blacklist/domain';
import { assertionSchema, registrationResponseSchema } from './webauthn-schemas.ts';

const actor = (req: FastifyRequest) => {
  if (!req.actor) throw new DomainError('session_expired');
  return req.actor;
};
const flow = (req: FastifyRequest) => {
  const token = req.headers.cookie
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith('__Host-bl_enroll='))
    ?.slice('__Host-bl_enroll='.length);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new DomainError('token_invalid');
  return token;
};
const pub = { security: { auth: 'public', mutation: true } } as const;
const admin = { security: { auth: 'staff', permission: 'staff:invite', mutation: true } } as const;
export function staffRoutes(app: FastifyInstance, ctx: IdentityContext) {
  app.get(
    '/api/v1/me/staff-recovery',
    { config: { security: { auth: 'staff', mutation: false } } },
    async (req) => staffRecoveryStatusSchema.nullable().parse(await ownRecoveryStatus(ctx, actor(req))),
  );
  app.get(
    '/api/v1/mod/recoveries',
    { config: { security: { auth: 'staff', permission: 'staff:recovery:verify', mutation: false } } },
    async (req) => ({
      kind: 'ok',
      data: z.array(recoveryCaseSchema).parse(await recoveryVerificationCases(ctx, actor(req))),
    }),
  );
  app.post(
    '/api/v1/mod/recoveries/verify',
    { config: { security: { auth: 'staff', permission: 'staff:recovery:verify', mutation: true } } },
    async (req) => {
      // Identity §10.11 step 2: method and rationale are recorded separately.
      const input = z
        .strictObject({
          id: z.uuid(),
          method: z.string().min(5).max(100),
          rationale: z.string().min(10).max(1000),
        })
        .parse(req.body);
      await verifyRecoveryIdentity(ctx, actor(req), input.id, input.method, input.rationale);
      return { kind: 'ok' };
    },
  );
  const readAdmin = { security: { auth: 'staff', permission: 'staff:invite', mutation: false } } as const;
  app.get('/api/v1/admin/overview', { config: readAdmin }, async (req) => ({
    kind: 'ok',
    data: adminOverviewSchema.parse((await staffAdministration(ctx, actor(req))).overview),
  }));
  app.get('/api/v1/admin/roles', { config: readAdmin }, async (req) => ({
    kind: 'ok',
    data: z.array(roleRequestSchema).parse((await staffAdministration(ctx, actor(req))).roles),
  }));
  app.get('/api/v1/admin/recoveries', { config: readAdmin }, async (req) => ({
    kind: 'ok',
    data: z.array(recoveryCaseSchema).parse((await staffAdministration(ctx, actor(req))).recoveries),
  }));
  app.get('/api/v1/admin/members', { config: readAdmin }, async (req) => ({
    kind: 'ok',
    data: z.array(memberAccountSchema).parse((await staffAdministration(ctx, actor(req))).members),
  }));
  app.post('/api/v1/admin/roles/cancel', { config: admin }, async (req) => {
    await cancelRoleRequest(ctx, actor(req), z.strictObject({ id: z.uuid() }).parse(req.body).id);
    return { kind: 'ok' };
  });
  app.post('/api/v1/admin/recoveries/object', { config: admin }, async (req) => {
    const input = z
      .strictObject({ id: z.uuid(), reason: z.string().trim().min(10).max(1000), assertion: assertionSchema })
      .parse(req.body);
    await objectRecovery(ctx, actor(req), input.id, input.reason, input.assertion);
    return { kind: 'ok' };
  });
  app.post('/api/v1/admin/recoveries/withdraw', { config: admin }, async (req) => {
    const input = z.strictObject({ id: z.uuid(), assertion: assertionSchema }).parse(req.body);
    await withdrawRecoveryObjection(ctx, actor(req), input.id, input.assertion);
    return { kind: 'ok' };
  });
  app.post('/api/v1/admin/recoveries/reopen', { config: admin }, async (req) => {
    const input = z.strictObject({ id: z.uuid(), assertion: assertionSchema }).parse(req.body);
    return { id: await reopenRecovery(ctx, actor(req), input.id, input.assertion) };
  });
  app.post('/api/v1/admin/members/state', { config: admin }, async (req) => {
    const input = z
      .strictObject({
        id: z.uuid(),
        operation: z.enum(['suspend', 'restore']),
        reason: z.string().min(10).max(2000),
        assertion: assertionSchema,
      })
      .parse(req.body);
    await suspendAccount(
      ctx,
      actor(req),
      input.id,
      input.reason,
      input.assertion,
      'member',
      input.operation === 'restore',
    );
    return { kind: 'ok' };
  });
  app.post(
    '/api/v1/auth/staff/stepup/preview',
    { config: { security: { auth: 'staff', mutation: true } } },
    async (req) => {
      await previewStepup(ctx, actor(req), assertionSchema.parse(req.body));
      return { kind: 'verified' };
    },
  );
  app.post('/api/v1/auth/staff/enrollment/start', { config: pub }, async (req, reply) => {
    const input = enrollmentStartSchema.parse(req.body);
    const result = await startEnrollment(ctx, input.token, input.code);
    if (result.kind === 'invalid') return { kind: 'invitation_problem', status: 'invalid' };
    if (result.kind !== 'ok') return result;
    reply.header(
      'set-cookie',
      `__Host-bl_enroll=${result.flowToken}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=900`,
    );
    return { kind: 'ok', role: result.role };
  });
  app.post('/api/v1/auth/staff/enrollment/password', { config: pub }, async (req) => {
    await setEnrollmentPassword(ctx, flow(req), enrollmentPasswordRequestSchema.parse(req.body).password);
    return { kind: 'ok' };
  });
  app.post('/api/v1/auth/staff/enrollment/challenge', { config: pub }, async (req) => {
    z.strictObject({}).parse(req.body);
    return enrollmentChallenge(ctx, flow(req));
  });
  app.post('/api/v1/auth/staff/enrollment/credential', { config: pub }, async (req) => {
    const input = z
      .strictObject({ challengeId: z.uuid(), response: registrationResponseSchema })
      .parse(req.body);
    await enrollAuthenticator(ctx, flow(req), input.challengeId, input.response);
    return { kind: 'verified' };
  });
  app.post('/api/v1/auth/staff/enrollment/complete', { config: pub }, async (req, reply) => {
    z.strictObject({}).parse(req.body);
    await completeEnrollment(ctx, flow(req));
    reply.header('set-cookie', '__Host-bl_enroll=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return { kind: 'ok' };
  });
  app.post(
    '/api/v1/auth/staff/login/challenge',
    { config: { security: { auth: 'staff_pending', mutation: true } } },
    async (req) => {
      z.strictObject({}).parse(req.body);
      return authenticationChallenge(ctx, actor(req), 'login');
    },
  );
  app.post(
    '/api/v1/auth/staff/login/assertion',
    { config: { security: { auth: 'staff_pending', mutation: true } } },
    async (req) => {
      await assureSession(ctx, actor(req), assertionSchema.parse(req.body));
      return { kind: 'verified' };
    },
  );
  app.post(
    '/api/v1/auth/staff/stepup/challenge',
    { config: { security: { auth: 'staff', mutation: true } } },
    async (req) => {
      const input = z
        .strictObject({
          action: z.string().min(1).max(80),
          targetType: z.string().min(1).max(40),
          targetId: z.string().min(1).max(80),
          parameters: z.unknown(),
        })
        .parse(req.body);
      return authenticationChallenge(ctx, actor(req), 'stepup', input);
    },
  );
  app.get(
    '/api/v1/me/staff-security',
    { config: { security: { auth: 'staff', mutation: false } } },
    async (req) => ({ kind: 'ok', data: staffSecuritySchema.parse(await staffSecurity(ctx, actor(req))) }),
  );
  app.post(
    '/api/v1/me/staff-authenticators/remove',
    { config: { security: { auth: 'staff', mutation: true } } },
    async (req) => {
      const input = z.strictObject({ id: z.uuid(), assertion: assertionSchema }).parse(req.body);
      await removeAuthenticator(ctx, actor(req), input.id, input.assertion);
      return { kind: 'ok' };
    },
  );
  app.post(
    '/api/v1/me/staff-authenticators/challenge',
    { config: { security: { auth: 'staff', mutation: true } } },
    async (req) => {
      z.strictObject({}).parse(req.body);
      return replacementChallenge(ctx, actor(req));
    },
  );
  app.post(
    '/api/v1/me/staff-authenticators/credential',
    { config: { security: { auth: 'staff', mutation: true } } },
    async (req) => {
      const input = z
        .strictObject({
          challengeId: z.uuid(),
          response: registrationResponseSchema,
          assertion: assertionSchema,
        })
        .parse(req.body);
      await registerReplacement(ctx, actor(req), input.challengeId, input.response, input.assertion);
      return { kind: 'verified' };
    },
  );
  app.post(
    '/api/v1/me/staff-password/prepare',
    { config: { security: { auth: 'staff', mutation: true } } },
    async (req) => {
      const input = passwordChangeFormSchema.parse(req.body);
      return prepareStaffPasswordChange(
        ctx,
        actor(req),
        input.currentPassword,
        input.newPassword,
        req.clientPrefix,
      );
    },
  );
  app.post(
    '/api/v1/me/staff-password/complete',
    { config: { security: { auth: 'staff', mutation: true } } },
    async (req) => {
      const input = z.strictObject({ intentId: z.uuid(), assertion: assertionSchema }).parse(req.body);
      await changeStaffPassword(ctx, actor(req), input.intentId, input.assertion);
      return { kind: 'ok' };
    },
  );
  app.post(
    '/api/v1/me/staff-email-change',
    { config: { security: { auth: 'staff', mutation: true } } },
    async (req) => {
      const input = z
        .strictObject({ request: emailChangeRequestSchema, assertion: assertionSchema })
        .parse(req.body);
      await requestStaffEmailChange(
        ctx,
        actor(req),
        input.request.newEmail,
        req.clientPrefix,
        input.assertion,
      );
      return { kind: 'ok' };
    },
  );
  app.get(
    '/api/v1/admin/staff',
    { config: { security: { auth: 'staff', permission: 'staff:invite', mutation: false } } },
    async (req) => ({ kind: 'ok', data: z.array(staffMemberSchema).parse(await listStaff(ctx, actor(req))) }),
  );
  app.get(
    '/api/v1/admin/invitations',
    { config: { security: { auth: 'staff', permission: 'staff:invite', mutation: false } } },
    async (req) => ({
      kind: 'ok',
      data: z.array(invitationSchema).parse(await listInvitations(ctx, actor(req))),
    }),
  );
  app.post('/api/v1/admin/invitations', { config: admin }, async (req) => {
    const input = z
      .strictObject({ request: invitationRequestSchema, assertion: assertionSchema })
      .parse(req.body);
    return inviteStaff(ctx, actor(req), input.request.email, input.request.role, input.assertion);
  });
  app.post('/api/v1/admin/invitations/action', { config: admin }, async (req) => {
    const input = z
      .strictObject({ id: z.uuid(), operation: z.enum(['approve', 'revoke']), assertion: assertionSchema })
      .parse(req.body);
    if (input.operation === 'approve') await approveInvitation(ctx, actor(req), input.id, input.assertion);
    else await revokeInvitation(ctx, actor(req), input.id, input.assertion);
    return { kind: 'ok' };
  });
  app.post('/api/v1/admin/staff/state', { config: admin }, async (req) => {
    const input = z
      .strictObject({
        id: z.uuid(),
        operation: z.enum(['suspend', 'offboard']),
        reason: z.string().min(10).max(2000),
        assertion: assertionSchema,
      })
      .parse(req.body);
    if (input.operation === 'suspend')
      await suspendAccount(ctx, actor(req), input.id, input.reason, input.assertion);
    else await offboardStaff(ctx, actor(req), input.id, input.reason, input.assertion);
    return { kind: 'ok' };
  });
  app.post('/api/v1/admin/roles', { config: admin }, async (req) => {
    const input = z
      .strictObject({
        targetId: z.uuid(),
        role: z.enum(['moderator', 'admin', 'appeal_reviewer']),
        operation: z.enum(['grant', 'revoke']),
        assertion: assertionSchema,
      })
      .parse(req.body);
    return {
      id: await requestRole(ctx, actor(req), input.targetId, input.role, input.operation, input.assertion),
    };
  });
  app.post('/api/v1/admin/roles/approve', { config: admin }, async (req) => {
    const input = z.strictObject({ id: z.uuid(), assertion: assertionSchema }).parse(req.body);
    await approveRole(ctx, actor(req), input.id, input.assertion);
    return { kind: 'ok' };
  });
  app.post('/api/v1/admin/recoveries', { config: admin }, async (req) => {
    const input = z.strictObject({ subjectId: z.uuid(), assertion: assertionSchema }).parse(req.body);
    return { id: await openRecovery(ctx, actor(req), input.subjectId, input.assertion) };
  });
  app.post(
    '/api/v1/admin/recoveries/verify',
    { config: { security: { auth: 'staff', permission: 'staff:recovery:verify', mutation: true } } },
    async (req) => {
      const input = z
        .strictObject({
          id: z.uuid(),
          method: z.string().min(5).max(100),
          rationale: z.string().min(10).max(1000),
        })
        .parse(req.body);
      await verifyRecoveryIdentity(ctx, actor(req), input.id, input.method, input.rationale);
      return { kind: 'ok' };
    },
  );
  app.post('/api/v1/admin/recoveries/action', { config: admin }, async (req) => {
    const input = z
      .strictObject({
        id: z.uuid(),
        operation: z.enum(['approve', 'complete']),
        assertion: assertionSchema,
      })
      .parse(req.body);
    if (input.operation === 'approve') await approveRecovery(ctx, actor(req), input.id, input.assertion);
    else if (input.operation === 'complete')
      return completeRecovery(ctx, actor(req), input.id, input.assertion);
    return { kind: 'ok' };
  });
}
