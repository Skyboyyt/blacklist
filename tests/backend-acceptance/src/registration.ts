import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { createAuth } from './auth.js';
import type { Harness } from './database.js';
import { hashPassword } from './password.js';
import * as schema from './schema.js';

export const digest = (input: string) => createHash('sha256').update(input).digest('hex');
export async function completeRegistration(
  h: Harness,
  secret: string,
  rawToken: string,
  password: string,
  failAt?: number,
) {
  const stored = await hashPassword(password);
  return h.transaction(async (tx) => {
    const intent = await tx
      .select()
      .from(schema.intents)
      .where(eq(schema.intents.tokenHash, digest(rawToken)))
      .for('update');
    const i = intent[0];
    if (!i || i.state !== 'issued' || !i.expiresAt || i.expiresAt.getTime() <= Date.now())
      throw new Error('registration_link_invalid');
    const checkpoint = (step: number) => {
      if (step === failAt) throw new Error('injected_registration_crash');
    };
    const context = await createAuth(tx, secret).$context;
    const created = await context.adapter.create<{ id: string }>({
      model: 'user',
      data: {
        email: i.email,
        name: 'Gate member',
        emailVerified: true,
        accountKind: 'member',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    checkpoint(1);
    await context.adapter.create({
      model: 'account',
      data: {
        userId: created.id,
        accountId: created.id,
        providerId: 'credential',
        password: stored,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    checkpoint(2);
    await tx.insert(schema.security).values({ userId: created.id });
    checkpoint(3);
    await tx.update(schema.intents).set({ state: 'completed' }).where(eq(schema.intents.id, i.id));
    checkpoint(4);
    await tx.execute(sqlAudit(created.id));
    checkpoint(5);
    return created.id;
  });
}
function sqlAudit(id: string) {
  return sql`select gate.append_audit('account.registered', ${id}::uuid, '{}'::jsonb)`;
}
