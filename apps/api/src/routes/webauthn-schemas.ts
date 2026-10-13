import { z } from 'zod';
const encoded = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/)
  .max(32000);
const base = {
  id: encoded,
  rawId: encoded,
  type: z.literal('public-key'),
  authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
  clientExtensionResults: z.record(z.string(), z.unknown()),
};
export const assertionSchema = z.strictObject({
  challengeId: z.uuid(),
  response: z.strictObject({
    ...base,
    response: z.strictObject({
      clientDataJSON: encoded,
      authenticatorData: encoded,
      signature: encoded,
      userHandle: encoded.optional(),
    }),
  }),
});
export const registrationResponseSchema = z.strictObject({
  ...base,
  response: z.strictObject({
    clientDataJSON: encoded,
    attestationObject: encoded,
    transports: z
      .array(z.enum(['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb']))
      .optional(),
    authenticatorData: encoded.optional(),
    publicKey: encoded.optional(),
    publicKeyAlgorithm: z.number().int().optional(),
  }),
});
