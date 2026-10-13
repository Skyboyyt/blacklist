import { schema, executor } from '@blacklist/db';
import type { IdentityContext } from './types.ts';
export async function requestPasswordReset(ctx: IdentityContext, email: string, prefix: string) {
  await ctx.runtime.transaction(async (tx, client) => {
    await ctx.throttle.requestLimit(tx, 'password_reset', email, prefix);
    const [request] = await tx
      .insert(schema.resetRequests)
      .values({ email, requestedIpPrefix: prefix })
      .returning({ id: schema.resetRequests.id });
    if (!request) throw new Error('reset_request_creation_failed');
    const id = request.id;
    await ctx.runtime.boss.send(
      'identity.password_reset.issue',
      { requestId: id },
      { db: executor(client), singletonKey: id },
    );
  });
}
