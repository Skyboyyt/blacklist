import { schema, eq } from '@blacklist/db';
import type { IdentityContext } from './types.ts';
import type { UserActor } from '../access/types.ts';
import { lockActor } from './sessions.ts';
import { DomainError } from '../shared/errors.ts';
export async function viewer(ctx: IdentityContext, actor: UserActor | null) {
  if (!actor) return { kind: 'anonymous' };
  if (actor.accountKind === 'staff' && !actor.roles.length) return { kind: 'anonymous' };
  const [profile] = await ctx.runtime.db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, actor.userId));
  if (!profile) return { kind: 'anonymous' };
  const role =
    actor.accountKind === 'member'
      ? 'member'
      : actor.roles.includes('admin')
        ? 'admin'
        : actor.roles.includes('moderator')
          ? 'moderator'
          : 'appeal_reviewer';
  return { kind: 'signed_in', handle: profile.handle, role, emailVerified: true };
}
export async function ownProfile(ctx: IdentityContext, actor: UserActor, displayName?: string | null) {
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    if (displayName !== undefined)
      await tx
        .update(schema.profiles)
        .set({ displayName, updatedAt: new Date() })
        .where(eq(schema.profiles.userId, actor.userId));
    const [profile] = await tx.select().from(schema.profiles).where(eq(schema.profiles.userId, actor.userId));
    if (!profile) throw new DomainError('not_found');
    return {
      handle: profile.handle,
      displayName: profile.displayName,
      updatedAt: profile.updatedAt.toISOString(),
    };
  });
}
export async function logout(ctx: IdentityContext, headers: Headers) {
  const result = await ctx.auth.api.signOut({ headers, returnHeaders: true });
  return result.headers.getSetCookie();
}
