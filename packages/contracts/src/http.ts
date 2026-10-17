import { z } from './zod.ts';
export const okEnvelopeSchema = <S extends z.ZodType>(schema: S) =>
  z.strictObject({ kind: z.literal('ok'), data: schema });
export const invitationIssueSchema = z.strictObject({
  invitationId: z.string().uuid(),
  enrollmentCode: z.string(),
});
export const idResponseSchema = z.strictObject({ id: z.string().uuid() });
/** Moderation refusals add a fixed server-written explanation and, for conflicts, the current version. */
export const httpRefusalSchema = z.object({
  detail: z.string().max(500).optional(),
  currentVersion: z.number().int().positive().optional(),
});
export const httpProblemSchema = z.object({
  code: z.string().min(1).max(80),
  requestId: z.string().max(100).optional(),
});
const descriptor = z.object({
  id: z.string(),
  type: z.literal('public-key'),
  transports: z.array(z.enum(['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'])).optional(),
});
export const authenticationChallengeSchema = z.strictObject({
  challengeId: z.string().uuid(),
  options: z.object({
    challenge: z.string(),
    rpId: z.string().optional(),
    timeout: z.number().optional(),
    userVerification: z.enum(['required', 'preferred', 'discouraged']).optional(),
    allowCredentials: z.array(descriptor).optional(),
  }),
});
export const registrationChallengeSchema = z.strictObject({
  challengeId: z.string().uuid(),
  options: z.object({
    challenge: z.string(),
    rp: z.object({ id: z.string().optional(), name: z.string() }),
    user: z.object({ id: z.string(), name: z.string(), displayName: z.string() }),
    pubKeyCredParams: z.array(z.object({ type: z.literal('public-key'), alg: z.number() })),
    timeout: z.number().optional(),
    attestation: z.enum(['none', 'indirect', 'direct', 'enterprise']).optional(),
    excludeCredentials: z.array(descriptor).optional(),
    authenticatorSelection: z
      .object({
        authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
        residentKey: z.enum(['required', 'preferred', 'discouraged']).optional(),
        requireResidentKey: z.boolean().optional(),
        userVerification: z.enum(['required', 'preferred', 'discouraged']).optional(),
      })
      .optional(),
  }),
});
export const staffActionSchema = z.strictObject({
  action: z.string().max(80),
  targetType: z.string().max(40),
  targetId: z.string().max(80),
  parameters: z.record(z.string(), z.unknown()),
});
export const credentialIntentSchema = z.strictObject({
  intentId: z.string().uuid(),
  action: staffActionSchema,
});
