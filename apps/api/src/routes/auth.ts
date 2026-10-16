import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  loginRequestSchema,
  registerStartRequestSchema,
  forgotPasswordRequestSchema,
  registerCompleteFormSchema,
  flowTokenSchema,
  resetPasswordFormSchema,
} from '@blacklist/contracts';
import {
  login,
  startRegistration,
  completeRegistration,
  requestPasswordReset,
  resetPassword,
  confirmEmailChange,
  resetChallenge,
  redeemRecoveryObjectionLink,
  type IdentityContext,
} from '@blacklist/domain';
import { assertionSchema } from './webauthn-schemas.ts';
const publicMutation = { security: { auth: 'public', mutation: true } } as const;
const registration = z.strictObject({ token: flowTokenSchema, form: registerCompleteFormSchema });
const reset = z.strictObject({
  token: flowTokenSchema,
  form: resetPasswordFormSchema,
  assertion: assertionSchema.optional(),
});
export function authRoutes(app: FastifyInstance, ctx: IdentityContext) {
  app.post('/api/v1/auth/login', { config: publicMutation }, async (req, reply) => {
    const input = loginRequestSchema.parse(req.body);
    const result = await login(ctx, input.email, input.password, req.clientPrefix, input.humanVerification);
    reply.header('set-cookie', result.cookies);
    return {
      kind: result.staffVerificationRequired ? 'staff_verification_required' : 'signed_in',
      ...(!result.staffVerificationRequired ? { redirectTo: '/dashboard' } : {}),
    };
  });
  app.post('/api/v1/auth/register/start', { config: publicMutation }, async (req, reply) => {
    await startRegistration(ctx, registerStartRequestSchema.parse(req.body).email, req.clientPrefix);
    return reply.code(202).send({ kind: 'accepted' });
  });
  app.post('/api/v1/auth/register/complete', { config: publicMutation }, async (req, reply) => {
    const input = registration.parse(req.body);
    const result = await completeRegistration(
      ctx,
      input.token,
      input.form.handle,
      input.form.password,
      req.clientPrefix,
    );
    reply.header('set-cookie', result.cookies);
    return { kind: 'success' };
  });
  app.post('/api/v1/auth/password/forgot', { config: publicMutation }, async (req, reply) => {
    await requestPasswordReset(ctx, forgotPasswordRequestSchema.parse(req.body).email, req.clientPrefix);
    return reply.code(202).send({ kind: 'accepted' });
  });
  app.post('/api/v1/auth/password/reset', { config: publicMutation }, async (req) => {
    const input = reset.parse(req.body);
    await resetPassword(ctx, input.token, input.form.password, req.clientPrefix, input.assertion);
    return { kind: 'success' };
  });
  app.post('/api/v1/auth/password/reset/challenge', { config: publicMutation }, async (req) =>
    resetChallenge(ctx, z.strictObject({ token: flowTokenSchema }).parse(req.body).token),
  );
  // ADR 0013 C2: records the subject's objection (or its one withdrawal); grants nothing else.
  app.post('/api/v1/auth/staff-recovery/objection', { config: publicMutation }, async (req) => {
    const input = z
      .strictObject({ token: flowTokenSchema, operation: z.enum(['object', 'withdraw']) })
      .parse(req.body);
    await redeemRecoveryObjectionLink(ctx, input.token, input.operation, req.clientPrefix);
    return { kind: 'success' };
  });
  app.post('/api/v1/auth/email-change/confirm', { config: publicMutation }, async (req) => {
    await confirmEmailChange(
      ctx,
      z.strictObject({ token: flowTokenSchema }).parse(req.body).token,
      req.clientPrefix,
      req.actor,
    );
    return { kind: 'success' };
  });
}
