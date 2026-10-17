import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  projectDirectoryRequestSchema,
  projectDirectoryResponseSchema,
  projectDetailSchema,
  projectSlugSchema,
  researchResultSchema,
  suggestionRequestSchema,
  correctionRequestSchema,
  createdIdSchema,
} from '@blacklist/contracts';
import {
  listProjects,
  projectDetail,
  submitSuggestion,
  submitCorrection,
  DomainError,
  type IdentityContext,
  type Permission,
} from '@blacklist/domain';

// Phase 10 slice 3: public project profiles and the directory (no combined project rating;
// each official address shows its own assessment), plus member suggestions (ADR 0010
// Part A) and profile corrections. Both stay private until staff accept them.
const actor = (req: FastifyRequest) => {
  if (!req.actor) throw new DomainError('session_expired');
  return req.actor;
};
const member = (permission: Permission) =>
  ({ security: { auth: 'member', permission, mutation: true } }) as const;
const slugParam = z.strictObject({ slug: projectSlugSchema });

export function projectRoutes(app: FastifyInstance, ctx: IdentityContext, publicBands = false) {
  for (const prefix of ['/api/v1', '/api/internal/v1']) {
    const config = {
      security: {
        auth: prefix.includes('/internal/') ? ('internal' as const) : ('public' as const),
        mutation: false,
      },
    };
    app.get(`${prefix}/projects`, { config }, async (req) => {
      const raw = z.record(z.string(), z.string()).parse(req.query ?? {});
      const query = projectDirectoryRequestSchema.parse({
        ...raw,
        ...(raw['page'] ? { page: Number(raw['page']) } : {}),
      });
      return projectDirectoryResponseSchema.parse(await listProjects(ctx.runtime.db, query, { publicBands }));
    });
    app.get(`${prefix}/projects/:slug`, { config }, async (req) => {
      const parsed = slugParam.safeParse(req.params);
      if (!parsed.success) return { kind: 'not_found' };
      const detail = await projectDetail(ctx.runtime.db, parsed.data.slug, { publicBands });
      return researchResultSchema(projectDetailSchema).parse(
        detail ? { kind: 'found', data: detail } : { kind: 'not_found' },
      );
    });
  }
  app.post('/api/v1/projects/suggestions', { config: member('report:create') }, async (req) => ({
    kind: 'ok',
    data: createdIdSchema.parse(
      await submitSuggestion(ctx, actor(req), suggestionRequestSchema.parse(req.body), req.clientPrefix),
    ),
  }));
  app.post('/api/v1/projects/:slug/corrections', { config: member('correction:create') }, async (req) => {
    const { slug } = slugParam.parse(req.params);
    const input = correctionRequestSchema.parse(req.body);
    if (input.projectSlug !== slug) throw new DomainError('not_found');
    return {
      kind: 'ok',
      data: createdIdSchema.parse(await submitCorrection(ctx, actor(req), input, req.clientPrefix)),
    };
  });
}
