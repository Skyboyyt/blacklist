import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  caseDetailSchema,
  findingRevisionSchema,
  staffFindingSchema,
  suspensionRequestSchema,
  findingHistorySchema,
  revisionBaseSchema,
  revisionDraftSchema,
} from '@blacklist/contracts';
import {
  getCase,
  listRevisions,
  approveRevision,
  rejectRevision,
  listFindings,
  suspendFinding,
  getFindingHistory,
  proposeRevision,
  DomainError,
  type IdentityContext,
  type Permission,
} from '@blacklist/domain';
import { assertionSchema } from './webauthn-schemas.ts';

// Phase 9a slice 3 (moderation design §2–§5, §8; api-integration-contracts §3). Approval and
// suspension need an action-bound step-up; the domain re-checks every independence rule.
const actor = (req: FastifyRequest) => {
  if (!req.actor) throw new DomainError('session_expired');
  return req.actor;
};
const version = z.number().int().positive();
const staff = (permission: Permission, mutation: boolean) =>
  ({ security: { auth: 'staff', permission, mutation } }) as const;

export function findingRoutes(app: FastifyInstance, ctx: IdentityContext) {
  const findingId = (req: FastifyRequest) => z.strictObject({ id: z.uuid() }).parse(req.params).id;
  app.get('/api/v1/mod/approvals', { config: staff('finding:publish', false) }, async (req) => ({
    kind: 'ok',
    data: z.array(findingRevisionSchema).parse(await listRevisions(ctx, actor(req))),
  }));
  app.post('/api/v1/mod/findings/:id/approvals', { config: staff('finding:publish', true) }, async (req) => {
    const input = z
      .discriminatedUnion('event', [
        z.strictObject({
          event: z.literal('approve'),
          revisionNumber: version,
          contentHash: findingRevisionSchema.shape.contentHash,
          assertion: assertionSchema,
        }),
        z.strictObject({
          event: z.literal('reject'),
          revisionNumber: version,
          rationale: z.string().trim().min(10).max(2000),
          assertion: assertionSchema,
        }),
      ])
      .parse(req.body);
    const id = findingId(req);
    const result =
      input.event === 'approve'
        ? await approveRevision(ctx, actor(req), id, input.revisionNumber, input.contentHash, input.assertion)
        : await rejectRevision(ctx, actor(req), id, input.revisionNumber, input.rationale, input.assertion);
    return { kind: 'ok', data: z.array(findingRevisionSchema).parse(result) };
  });
  app.get('/api/v1/mod/findings', { config: staff('finding:suspend', false) }, async (req) => ({
    kind: 'ok',
    data: z.array(staffFindingSchema).parse(await listFindings(ctx, actor(req))),
  }));
  app.post('/api/v1/mod/findings/:id/suspend', { config: staff('finding:suspend', true) }, async (req) => {
    const input = z
      .strictObject({ ...suspensionRequestSchema.shape, assertion: assertionSchema })
      .parse(req.body);
    const caseId = await suspendFinding(ctx, actor(req), findingId(req), input.reason, input.assertion);
    return { kind: 'ok', data: caseDetailSchema.parse(await getCase(ctx, actor(req), caseId)) };
  });
  app.get('/api/v1/mod/findings/:id/revisions', { config: staff('finding:propose', false) }, async (req) => ({
    kind: 'ok',
    data: findingHistorySchema.parse(await getFindingHistory(ctx, actor(req), findingId(req))),
  }));
  app.post('/api/v1/mod/findings/:id/revisions', { config: staff('finding:propose', true) }, async (req) => {
    const input = z.strictObject({ base: revisionBaseSchema, draft: revisionDraftSchema }).parse(req.body);
    return {
      kind: 'ok',
      data: findingHistorySchema.parse(
        await proposeRevision(ctx, actor(req), findingId(req), input.base, input.draft),
      ),
    };
  });
}
