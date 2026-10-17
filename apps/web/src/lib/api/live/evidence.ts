import { evidenceLinkSchema, evidenceUploadResponseSchema, okEnvelopeSchema } from '@blacklist/contracts';
import { request, uploadImage, ApiFailure } from './transport';

// Image evidence (Phase 9b; ADR 0004, ADR 0020). Live only: the demo build simulates
// uploads and has no files to download.

export type UploadOutcome =
  | { readonly kind: 'ok'; readonly id: string }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'error'; readonly message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Uploads one image; the server checks the type and size again and never trusts the name. */
export async function uploadEvidenceImage(file: File): Promise<UploadOutcome> {
  try {
    const { data } = await uploadImage(
      '/evidence/images',
      okEnvelopeSchema(evidenceUploadResponseSchema),
      file,
    );
    return { kind: 'ok', id: data.id };
  } catch (error) {
    const code = error instanceof ApiFailure ? error.code : 'temporarily_unavailable';
    if (code === 'evidence_unavailable') return { kind: 'unavailable' };
    if (code === 'session_expired') return { kind: 'error', message: 'Sign in again, then retry.' };
    if (code === 'payload_too_large')
      return { kind: 'error', message: 'The file is too large to upload. Try a smaller image.' };
    if (code === 'rate_limited')
      return {
        kind: 'error',
        message:
          (error instanceof ApiFailure && error.detail) || 'Too many uploads for now. Try again later.',
      };
    if (code === 'invalid_request' || code === 'image_required')
      return { kind: 'error', message: 'Only PNG, JPEG and WebP images up to 10 MiB are accepted.' };
    return { kind: 'error', message: 'The upload did not complete. Retry in a moment.' };
  }
}

/** A five-minute download link for the sanitized copy of an image (staff only). */
export async function getEvidenceLink(evidenceId: string): Promise<string | null> {
  if (!UUID.test(evidenceId)) return null;
  try {
    const { data } = await request(
      `/mod/evidence/${evidenceId}/link`,
      okEnvelopeSchema(evidenceLinkSchema),
      {},
    );
    return data.url;
  } catch {
    return null;
  }
}
