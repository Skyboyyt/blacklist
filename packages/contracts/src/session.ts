/**
 * Viewer (session) DTO.
 *
 * The viewer role drives navigation and layout only. Every permission is
 * enforced by the API; hiding a link is never access control.
 */
import { z } from './zod.ts';

export const viewerRoleSchema = z.enum(['member', 'moderator', 'admin']);
export type ViewerRole = z.infer<typeof viewerRoleSchema>;

export const viewerSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('anonymous'),
    /** Why there is no session, when the server knows: used only to choose helpful copy. */
    reason: z.enum(['session_expired', 'staff_verification_expired']).optional(),
  }),
  z.strictObject({
    kind: z.literal('signed_in'),
    handle: z.string(),
    role: viewerRoleSchema,
    emailVerified: z.boolean(),
  }),
]);
export type Viewer = z.infer<typeof viewerSchema>;
