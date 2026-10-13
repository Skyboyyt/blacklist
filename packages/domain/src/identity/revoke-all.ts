import { schema, eq } from '@blacklist/db';
import type { UserActor } from '../access/types.ts';
import { requirePermission } from '../access/policies.ts';
import { DomainError } from '../shared/errors.ts';
import { lockActor, requireReauth } from './sessions.ts';
import type { IdentityContext } from './types.ts';
import { withStepup, type AssertionInput } from '../staff/webauthn.ts';
export async function revokeAllSessions(ctx: IdentityContext, actor: UserActor, assertion?: AssertionInput) {
  requirePermission(actor, 'session:manage:own');
  if (actor.accountKind === 'staff') {
    if (!assertion) throw new DomainError('passkey_required');
    return withStepup(
      ctx,
      actor,
      { action: 'account.sessions_revoke_all', targetType: 'account', targetId: 'me', parameters: {} },
      assertion,
      async (tx) => {
        await tx.delete(schema.session).where(eq(schema.session.userId, actor.userId));
      },
    );
  }
  return ctx.runtime.transaction(async (tx) => {
    const { policy } = await lockActor(tx, actor);
    requireReauth(policy);
    await tx.delete(schema.session).where(eq(schema.session.userId, actor.userId));
  });
}
