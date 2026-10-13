import { schema, eq, and, inArray, sql, executor } from '@blacklist/db';
import type { OperatorActor } from '../access/types.ts';
import { appendAudit } from '../audit/service.ts';
import { DomainError } from '../shared/errors.ts';
import type { IdentityContext } from '../identity/types.ts';
import { lockTarget, invalidateAccount } from './common.ts';
import { insertInvitation } from './invitations.ts';
export function bootstrapStaff(ctx: IdentityContext, actor: OperatorActor, email: string) {
  return ctx.runtime.transaction(async (tx, client) => {
    const [state] = await tx
      .select()
      .from(schema.systemState)
      .where(eq(schema.systemState.key, 1))
      .for('update');
    const staff = await tx
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.accountKind, 'staff'));
    const pending = await tx
      .select()
      .from(schema.invitations)
      .where(
        and(
          eq(schema.invitations.basis, 'bootstrap'),
          inArray(schema.invitations.state, ['issued', 'pending_approval']),
          sql`${schema.invitations.expiresAt}>now()`,
        ),
      );
    if (!state || state.staffBootstrapCompletedAt || staff.length || pending.length)
      throw new DomainError('forbidden');
    return insertInvitation(ctx, tx, client, actor, email, 'admin', 'bootstrap');
  });
}
export function breakGlass(ctx: IdentityContext, actor: OperatorActor, email: string, incidentRef: string) {
  if (!ctx.settings.breakGlassEnabled || !/^INC-[A-Za-z0-9_-]{1,60}$/.test(incidentRef))
    throw new DomainError('forbidden');
  return ctx.runtime.transaction(async (tx, client) => {
    await tx.execute(sql`select pg_advisory_xact_lock(730026)`);
    const staff = await tx
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.accountKind, 'staff'));
    for (const u of staff) {
      const { state } = await lockTarget(tx, u.id);
      await invalidateAccount(tx, u.id, state.securityVersion + 1);
      await ctx.runtime.boss.send(
        'identity.security_notice',
        { accountId: u.id, kind: 'break_glass_invoked' },
        { db: executor(client) },
      );
    }
    const result = await insertInvitation(ctx, tx, client, actor, email, 'admin', 'break_glass');
    await appendAudit(tx, actor, 'staff.breakglass.invoked', 'invitation', result.invitationId, {
      incidentRef,
    });
    return result;
  });
}
