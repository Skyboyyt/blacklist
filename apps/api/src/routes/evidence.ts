import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { evidenceLinkSchema, evidenceUploadResponseSchema } from '@blacklist/contracts';
import {
  uploadEvidenceImage,
  issueDerivativeLink,
  DomainError,
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  type EvidenceStorage,
  type IdentityContext,
} from '@blacklist/domain';

// Phase 9b image upload (ARCHITECTURE §14.3, ADR 0020). One raw image per request, with
// its own body limit; exact Origin still applies. The bytes are never parsed here.
const actor = (req: FastifyRequest) => {
  if (!req.actor) throw new DomainError('session_expired');
  return req.actor;
};

export function evidenceRoutes(app: FastifyInstance, ctx: IdentityContext, storage: EvidenceStorage | null) {
  app.addContentTypeParser(
    [...IMAGE_TYPES],
    { parseAs: 'buffer', bodyLimit: MAX_IMAGE_BYTES },
    (_req, body, done) => done(null, body),
  );
  app.post(
    '/api/v1/evidence/images',
    {
      bodyLimit: MAX_IMAGE_BYTES,
      config: { security: { auth: 'member', permission: 'report:create', mutation: true, body: 'image' } },
    },
    async (req) => {
      const body = req.body;
      if (!Buffer.isBuffer(body)) throw new DomainError('invalid_request');
      const bytes = new Uint8Array(body.length);
      bytes.set(body);
      return {
        kind: 'ok',
        data: evidenceUploadResponseSchema.parse(
          await uploadEvidenceImage(
            ctx,
            storage,
            actor(req),
            { bytes, contentType: req.headers['content-type']?.split(';')[0]?.trim() },
            req.clientPrefix,
          ),
        ),
      };
    },
  );
  // Staff download of a sanitized copy; every issued link is recorded in custody history.
  app.post(
    '/api/v1/mod/evidence/:id/link',
    { config: { security: { auth: 'staff', permission: 'moderation:case:read', mutation: true } } },
    async (req) => {
      z.strictObject({}).parse(req.body ?? {});
      const { id } = z.strictObject({ id: z.uuid() }).parse(req.params);
      return {
        kind: 'ok',
        data: evidenceLinkSchema.parse(await issueDerivativeLink(ctx, storage, actor(req), id)),
      };
    },
  );
}
