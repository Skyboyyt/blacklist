import { schema, eq, and, isNull, inArray, executor, type Database } from '@blacklist/db';
import { DomainError } from '../shared/errors.ts';
import type { IdentityContext } from '../identity/types.ts';
export type Client = Parameters<Parameters<IdentityContext['runtime']['transaction']>[0]>[1];
export async function adminCount(tx: Database) {
  const rows = await tx
    .select({ id: schema.user.id })
    .from(schema.roles)
    .innerJoin(schema.user, eq(schema.roles.userId, schema.user.id))
    .where(
      and(eq(schema.roles.role, 'admin'), isNull(schema.roles.revokedAt), eq(schema.user.status, 'active')),
    );
  return new Set(rows.map((r) => r.id)).size;
}
export async function notifyAdmins(
  ctx: IdentityContext,
  tx: Database,
  client: Client,
  kind: string,
  subjectId?: string,
) {
  const rows = await tx
    .select({ id: schema.user.id })
    .from(schema.roles)
    .innerJoin(schema.user, eq(schema.roles.userId, schema.user.id))
    .where(
      and(eq(schema.roles.role, 'admin'), isNull(schema.roles.revokedAt), eq(schema.user.status, 'active')),
    );
  const ids = new Set(rows.map((r) => r.id));
  if (subjectId) ids.add(subjectId);
  for (const accountId of ids)
    await ctx.runtime.boss.send('identity.security_notice', { accountId, kind }, { db: executor(client) });
}
export async function lockTarget(tx: Database, userId: string, kind = 'staff') {
  const [state] = await tx
    .select()
    .from(schema.security)
    .where(eq(schema.security.userId, userId))
    .for('update');
  const [user] = await tx.select().from(schema.user).where(eq(schema.user.id, userId));
  if (!state || !user || user.accountKind !== kind) throw new DomainError('not_found');
  return { state, user };
}
export async function invalidateAccount(tx: Database, userId: string, newVersion: number) {
  await tx.delete(schema.session).where(eq(schema.session.userId, userId));
  await tx
    .update(schema.tokens)
    .set({ state: 'invalidated', terminalAt: new Date(), invalidationReason: 'security_transition' })
    .where(
      and(eq(schema.tokens.userId, userId), inArray(schema.tokens.state, ['pending_delivery', 'active'])),
    );
  await tx
    .update(schema.security)
    .set({ securityVersion: newVersion })
    .where(eq(schema.security.userId, userId));
}
