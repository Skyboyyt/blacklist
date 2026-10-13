import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  reauthRequestSchema,
  passwordChangeFormSchema,
  emailChangeRequestSchema,
  accountSecuritySchema,
  profileSchema,
  profileUpdateSchema,
  viewerSchema,
} from '@blacklist/contracts';
import {
  accountSecurity,
  reauthenticate,
  changePassword,
  requestEmailChange,
  revokeSessions,
  revokeAllSessions,
  viewer,
  ownProfile,
  logout,
  DomainError,
  type IdentityContext,
} from '@blacklist/domain';
import { requestHeaders } from '../plugins/security.ts';
import { assertionSchema } from './webauthn-schemas.ts';

export function accountRoutes(app: FastifyInstance, ctx: IdentityContext) {
  app.get('/api/v1/viewer', { config: { security: { auth: 'public', mutation: false } } }, async (req) =>
    viewerSchema.parse(await viewer(ctx, req.actor)),
  );
  app.get(
    '/api/internal/v1/viewer',
    { config: { security: { auth: 'internal', mutation: false } } },
    async (req) => viewerSchema.parse(await viewer(ctx, req.actor)),
  );
  app.post(
    '/api/v1/auth/logout',
    { config: { security: { auth: 'public', mutation: true } } },
    async (req, reply) => {
      reply.header('set-cookie', await logout(ctx, requestHeaders(req)));
      return { kind: 'ok' };
    },
  );
  app.get(
    '/api/v1/me/security',
    { config: { security: { auth: 'authenticated', permission: 'session:manage:own', mutation: false } } },
    async (req) => {
      if (!req.actor) throw new DomainError('session_expired');
      return { kind: 'ok', data: accountSecuritySchema.parse(await accountSecurity(ctx, req.actor)) };
    },
  );
  app.post(
    '/api/v1/auth/reauth',
    { config: { security: { auth: 'member', mutation: true } } },
    async (req) => {
      if (!req.actor) throw new DomainError('session_expired');
      await reauthenticate(ctx, req.actor, reauthRequestSchema.parse(req.body).password);
      return { kind: 'ok' };
    },
  );
  app.post(
    '/api/v1/me/password',
    { config: { security: { auth: 'member', permission: 'session:manage:own', mutation: true } } },
    async (req) => {
      if (!req.actor) throw new DomainError('session_expired');
      const form = passwordChangeFormSchema.parse(req.body);
      await changePassword(ctx, req.actor, form.currentPassword, form.newPassword);
      return { kind: 'ok' };
    },
  );
  app.post(
    '/api/v1/me/email-change',
    { config: { security: { auth: 'member', mutation: true } } },
    async (req) => {
      if (!req.actor) throw new DomainError('session_expired');
      await requestEmailChange(
        ctx,
        req.actor,
        emailChangeRequestSchema.parse(req.body).newEmail,
        req.clientPrefix,
      );
      return { kind: 'ok' };
    },
  );
  app.post(
    '/api/v1/me/sessions/revoke',
    { config: { security: { auth: 'authenticated', permission: 'session:manage:own', mutation: true } } },
    async (req) => {
      if (!req.actor) throw new DomainError('session_expired');
      await revokeSessions(
        ctx,
        req.actor,
        z.strictObject({ sessionId: z.union([z.uuid(), z.literal('others')]) }).parse(req.body).sessionId,
      );
      return { kind: 'ok' };
    },
  );
  app.post(
    '/api/v1/me/sessions/revoke-all',
    { config: { security: { auth: 'authenticated', permission: 'session:manage:own', mutation: true } } },
    async (req, reply) => {
      if (!req.actor) throw new DomainError('session_expired');
      const input = z.strictObject({ assertion: assertionSchema.optional() }).parse(req.body);
      await revokeAllSessions(ctx, req.actor, input.assertion);
      reply.header('set-cookie', '__Host-bl_session=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
      return { kind: 'ok' };
    },
  );
  app.get('/api/v1/me', { config: { security: { auth: 'member', mutation: false } } }, async (req) => {
    if (!req.actor) throw new DomainError('session_expired');
    return { kind: 'ok', data: profileSchema.parse(await ownProfile(ctx, req.actor)) };
  });
  app.patch(
    '/api/v1/me',
    { config: { security: { auth: 'member', permission: 'profile:update:own', mutation: true } } },
    async (req) => {
      if (!req.actor) throw new DomainError('session_expired');
      return {
        kind: 'ok',
        data: profileSchema.parse(
          await ownProfile(ctx, req.actor, profileUpdateSchema.parse(req.body).displayName),
        ),
      };
    },
  );
}
