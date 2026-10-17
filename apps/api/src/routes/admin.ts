import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  adminLabelSchema,
  auditEntrySchema,
  isAddressFor,
  labelRequestSchema,
  reasonRequestSchema,
  suppressionRequestSchema,
  suppressionSchema,
} from '@blacklist/contracts';
import {
  addLabel,
  auditEntries,
  liftSuppression,
  listLabels,
  listSuppressions,
  retireLabel,
  suppressSignal,
  DomainError,
  type IdentityContext,
  type Permission,
} from '@blacklist/domain';
import { assertionSchema } from './webauthn-schemas.ts';

// Phase 10 slice 4: administrator labels, signal suppressions and the audit viewer. Every
// handler validates its input and calls one domain function, which re-checks permission.
const actor = (req: FastifyRequest) => {
  if (!req.actor) throw new DomainError('session_expired');
  return req.actor;
};
const staff = (permission: Permission, mutation: boolean) =>
  ({ security: { auth: 'staff', permission, mutation } }) as const;
const validAddress = <T extends { chain: 'ethereum' | 'solana'; address: string }>(input: T): T => {
  if (!isAddressFor(input.chain, input.address)) throw new DomainError('invalid_request');
  return input;
};
const labels = adminLabelSchema.array();
const suppressions = suppressionSchema.array();

export function adminRoutes(app: FastifyInstance, ctx: IdentityContext) {
  app.get('/api/v1/admin/labels', { config: staff('label:manage', false) }, async (req) => ({
    kind: 'ok',
    data: labels.parse(await listLabels(ctx, actor(req))),
  }));
  app.post('/api/v1/admin/labels', { config: staff('label:manage', true) }, async (req) => ({
    kind: 'ok',
    data: labels.parse(await addLabel(ctx, actor(req), validAddress(labelRequestSchema.parse(req.body)))),
  }));
  app.post('/api/v1/admin/labels/retire', { config: staff('label:manage', true) }, async (req) => {
    const input = z.strictObject({ id: z.uuid(), ...reasonRequestSchema.shape }).parse(req.body);
    return { kind: 'ok', data: labels.parse(await retireLabel(ctx, actor(req), input.id, input.reason)) };
  });
  app.get('/api/v1/admin/suppressions', { config: staff('signal:suppress', false) }, async (req) => ({
    kind: 'ok',
    data: suppressions.parse(await listSuppressions(ctx, actor(req))),
  }));
  app.post('/api/v1/admin/suppressions', { config: staff('signal:suppress', true) }, async (req) => {
    const input = z
      .strictObject({ request: suppressionRequestSchema, assertion: assertionSchema })
      .parse(req.body);
    return {
      kind: 'ok',
      data: suppressions.parse(
        await suppressSignal(ctx, actor(req), validAddress(input.request), input.assertion),
      ),
    };
  });
  app.post('/api/v1/admin/suppressions/lift', { config: staff('signal:suppress', true) }, async (req) => {
    const input = z
      .strictObject({ id: z.uuid(), ...reasonRequestSchema.shape, assertion: assertionSchema })
      .parse(req.body);
    return {
      kind: 'ok',
      data: suppressions.parse(
        await liftSuppression(ctx, actor(req), input.id, input.reason, input.assertion),
      ),
    };
  });
  app.get('/api/v1/mod/audit', { config: staff('audit:read', false) }, async (req) => {
    const query = z.strictObject({ caseId: z.uuid().optional() }).parse(req.query ?? {});
    return {
      kind: 'ok',
      data: auditEntrySchema.array().parse(await auditEntries(ctx, actor(req), query.caseId)),
    };
  });
}
