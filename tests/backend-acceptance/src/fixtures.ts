import { randomBytes } from 'node:crypto';
import type { Harness } from './database.js';
import { completeRegistration, digest } from './registration.js';
import * as schema from './schema.js';

export const fixturePassword = 'fictional acceptance passphrase';
export async function createMember(h: Harness, secret: string) {
  const raw = randomBytes(32).toString('base64url');
  const email = `gate-${randomBytes(8).toString('hex')}@example.test`;
  await h.db
    .insert(schema.intents)
    .values({ email, state: 'issued', tokenHash: digest(raw), expiresAt: new Date(Date.now() + 1800_000) });
  const userId = await completeRegistration(h, secret, raw, fixturePassword);
  const [request] = await h.db.insert(schema.resetRequests).values({ email }).returning();
  if (!request) throw new Error('reset fixture missing');
  return { email, userId, requestId: request.id };
}
export function tokenFromLink(link: string) {
  return new URLSearchParams(new URL(link).hash.slice(1)).get('token') ?? '';
}
