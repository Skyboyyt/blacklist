import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { ChainSnapshot } from './types.ts';
import { ProviderFault } from './providers/rpc-transport.ts';
import { solanaAdapter } from './adapters/identity.ts';
const decimal = z
  .string()
  .regex(/^(0|[1-9]\d*)$/u)
  .max(78);
const snapshotSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('evm_block'),
    blockNumber: decimal,
    blockHash: z.string().regex(/^0x[\da-f]{64}$/u),
  }),
  z.object({ kind: z.literal('solana_context'), contextSlot: decimal }),
  z.object({
    kind: z.literal('solana_transaction'),
    signature: z.string().transform((v, ctx) => {
      const parsed = solanaAdapter.parseTxHash(v);
      if (!parsed) {
        ctx.addIssue({ code: 'custom', message: 'invalid_signature' });
        return z.NEVER;
      }
      return parsed;
    }),
    slot: decimal,
  }),
]);
const schema = z.strictObject({
  providerId: z.string().regex(/^[a-z0-9_-]{1,64}$/u),
  chainId: z.string().max(80),
  address: z.string().max(90),
  cursor: z.string().min(1).max(512),
  snapshot: snapshotSchema,
  limit: z.number().int().min(1).max(100),
  direction: z.enum(['all', 'in', 'out']),
  expires: z.number().int().safe(),
});
type Cursor = z.infer<typeof schema>;
/** Ephemeral authenticated encryption: opaque provider cursors never expose provider metadata or credentials. */
export function createCursorCodec(now = Date.now) {
  const secret = randomBytes(32);
  return {
    encode: (input: Omit<Cursor, 'expires' | 'snapshot'> & { snapshot: ChainSnapshot }) => {
      const payload = JSON.stringify(schema.parse({ ...input, expires: now() + 5 * 60000 })),
        iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', secret, iv);
      const body = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
    },
    decode: (
      value: string,
      expected: { chainId: string; address: string; limit: number; direction: 'all' | 'in' | 'out' },
    ): Cursor => {
      try {
        if (value.length > 2048 || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('invalid');
        const bytes = Buffer.from(value, 'base64url');
        if (bytes.length <= 28) throw new Error('invalid');
        const decipher = createDecipheriv('aes-256-gcm', secret, bytes.subarray(0, 12));
        decipher.setAuthTag(bytes.subarray(12, 28));
        const payload = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString(
          'utf8',
        );
        const parsed = schema.parse(JSON.parse(payload));
        if (
          parsed.expires <= now() ||
          Object.entries(expected).some(([key, v]) => Reflect.get(parsed, key) !== v)
        )
          throw new Error('invalid');
        return parsed;
      } catch {
        throw new ProviderFault('not_supported');
      }
    },
  };
}
