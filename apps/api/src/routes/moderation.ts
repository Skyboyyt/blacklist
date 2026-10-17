import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  reportRequestSchema,
  infoResponseSchema,
  memberSubmissionSummarySchema,
  memberSubmissionDetailSchema,
  memberNoticeSchema,
  queueRequestSchema,
  queueResponseSchema,
  caseDetailSchema,
  caseDecisionSchema,
  noteRequestSchema,
} from '@blacklist/contracts';
import {
  submitReport,
  listOwnSubmissions,
  getOwnSubmission,
  withdrawOwnSubmission,
  respondToInfoRequest,
  listOwnNotices,
  caseQueue,
  getCase,
  assignCase,
  addCaseNote,
  decideCase,
  DomainError,
  type IdentityContext,
  type Permission,
} from '@blacklist/domain';
import { assertionSchema } from './webauthn-schemas.ts';

// Phase 9a slice 2 (docs/design/api-integration-contracts.md §2–§3). Route guards check the
// account kind and permission; the domain re-checks ownership, scope, state and version.
const actor = (req: FastifyRequest) => {
  if (!req.actor) throw new DomainError('session_expired');
  return req.actor;
};
const caseId = (req: FastifyRequest) => z.strictObject({ id: z.uuid() }).parse(req.params).id;
const version = z.number().int().positive();
const member = (permission: Permission, mutation: boolean) =>
  ({ security: { auth: 'member', permission, mutation } }) as const;
const staff = (permission: Permission, mutation: boolean) =>
  ({ security: { auth: 'staff', permission, mutation } }) as const;

export function moderationRoutes(app: FastifyInstance, ctx: IdentityContext, images = false) {
  app.get('/api/v1/me/submissions', { config: member('report:read:own', false) }, async (req) => ({
    kind: 'ok',
    data: z.array(memberSubmissionSummarySchema).parse(await listOwnSubmissions(ctx, actor(req))),
  }));
  app.get('/api/v1/me/submissions/:id', { config: member('report:read:own', false) }, async (req) => ({
    kind: 'ok',
    data: memberSubmissionDetailSchema.parse(await getOwnSubmission(ctx, actor(req), caseId(req))),
  }));
  // A report is created and submitted in one request; images are uploaded first and
  // referenced by id (Phase 9b).
  app.post('/api/v1/reports', { config: member('report:create', true) }, async (req) => ({
    kind: 'ok',
    data: z.strictObject({ id: z.string() }).parse(
      await submitReport(ctx, actor(req), reportRequestSchema.parse(req.body), req.clientPrefix, {
        images,
      }),
    ),
  }));
  app.post('/api/v1/reports/:id/withdraw', { config: member('report:read:own', true) }, async (req) => {
    const input = z.strictObject({ expectedVersion: version }).parse(req.body);
    return {
      kind: 'ok',
      data: memberSubmissionDetailSchema.parse(
        await withdrawOwnSubmission(ctx, actor(req), caseId(req), input.expectedVersion),
      ),
    };
  });
  app.post(
    '/api/v1/me/submissions/:id/responses',
    { config: member('report:read:own', true) },
    async (req) => {
      const input = z
        .strictObject({ expectedVersion: version, response: infoResponseSchema })
        .parse(req.body);
      return {
        kind: 'ok',
        data: memberSubmissionDetailSchema.parse(
          await respondToInfoRequest(ctx, actor(req), caseId(req), input.expectedVersion, input.response),
        ),
      };
    },
  );
  app.get('/api/v1/me/notifications', { config: member('notification:read:own', false) }, async (req) => ({
    kind: 'ok',
    data: z.array(memberNoticeSchema).parse(await listOwnNotices(ctx, actor(req))),
  }));

  app.get('/api/v1/mod/queue', { config: staff('moderation:queue:read', false) }, async (req) => {
    const raw = z.record(z.string(), z.string()).parse(req.query ?? {});
    const query = queueRequestSchema.parse({ ...raw, ...(raw['page'] ? { page: Number(raw['page']) } : {}) });
    return { kind: 'ok', data: queueResponseSchema.parse(await caseQueue(ctx, actor(req), query)) };
  });
  app.get('/api/v1/mod/cases/:id', { config: staff('moderation:case:read', false) }, async (req) => ({
    kind: 'ok',
    data: caseDetailSchema.parse(await getCase(ctx, actor(req), caseId(req))),
  }));
  app.post(
    '/api/v1/mod/cases/:id/assignment',
    { config: staff('moderation:case:assign', true) },
    async (req) => {
      const input = z
        .strictObject({
          expectedVersion: version,
          to: z.enum(['me', 'nobody']),
          takeOver: z.boolean().optional(),
        })
        .parse(req.body);
      return {
        kind: 'ok',
        data: caseDetailSchema.parse(
          await assignCase(ctx, actor(req), caseId(req), input.expectedVersion, {
            to: input.to,
            takeOver: input.takeOver,
          }),
        ),
      };
    },
  );
  app.post('/api/v1/mod/cases/:id/notes', { config: staff('moderation:case:read', true) }, async (req) => {
    const input = z.strictObject({ expectedVersion: version, ...noteRequestSchema.shape }).parse(req.body);
    return {
      kind: 'ok',
      data: caseDetailSchema.parse(
        await addCaseNote(ctx, actor(req), caseId(req), input.expectedVersion, input.text),
      ),
    };
  });
  app.post(
    '/api/v1/mod/cases/:id/decisions',
    { config: staff('moderation:case:read', true) },
    async (req) => {
      const input = z
        .strictObject({
          expectedVersion: version,
          decision: caseDecisionSchema,
          assertion: assertionSchema.optional(),
        })
        .parse(req.body);
      return {
        kind: 'ok',
        data: caseDetailSchema.parse(
          await decideCase(
            ctx,
            actor(req),
            caseId(req),
            input.expectedVersion,
            input.decision,
            input.assertion,
          ),
        ),
      };
    },
  );
}
