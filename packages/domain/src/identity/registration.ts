import { schema, eq, and, inArray, sql, executor } from '@blacklist/db';
import { digest } from '../shared/crypto.ts';
import { DomainError } from '../shared/errors.ts';
import { actorReference, appendAudit } from '../audit/service.ts';
import { preparePassword, validateHandle } from './password-policy.ts';
import { createAuth } from './auth.ts';
import { signIn } from './login.ts';
import type { IdentityContext } from './types.ts';
import { admitTokenAction } from './token-throttle.ts';
import { registrationAllowed } from './registration-access.ts';

export async function startRegistration(ctx: IdentityContext, email: string, prefix: string) {
  await ctx.runtime.transaction(async (tx, client) => {
    await ctx.throttle.requestLimit(tx, 'registration', email, prefix);
    // Serialize starts without looking up account existence (including first intent).
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`register:${email}`},0))`);
    await tx
      .update(schema.intents)
      .set({ state: 'superseded', closeReason: 'newer_intent', supersededAt: new Date() })
      .where(
        and(
          eq(schema.intents.email, email),
          inArray(schema.intents.state, ['requested', 'pending_delivery', 'issued']),
        ),
      );
    const [intent] = await tx
      .insert(schema.intents)
      .values({ email, state: 'requested', requestedIpPrefix: prefix })
      .returning({ id: schema.intents.id });
    if (!intent) throw new Error('intent_creation_failed');
    const id = intent.id;
    await ctx.runtime.boss.send(
      'identity.registration.issue',
      { intentId: id },
      { db: executor(client), singletonKey: id },
    );
  });
}
export async function completeRegistration(
  ctx: IdentityContext,
  rawToken: string,
  handleInput: string,
  password: string,
  prefix: string,
) {
  await admitTokenAction(ctx, 'registration.complete', rawToken, prefix);
  const handle = validateHandle(handleInput);
  // Cheap token pre-check before Argon2 and the breach lookup (CR-15.2); the locked
  // re-check below stays authoritative.
  const [candidate] = await ctx.runtime.db
    .select({ state: schema.intents.state, expiresAt: schema.intents.expiresAt, email: schema.intents.email })
    .from(schema.intents)
    .where(eq(schema.intents.tokenHash, digest(rawToken)));
  if (
    !candidate ||
    candidate.state !== 'issued' ||
    !candidate.expiresAt ||
    candidate.expiresAt.getTime() <= Date.now() ||
    !registrationAllowed(ctx.settings.registration, candidate.email)
  )
    throw new DomainError('token_invalid');
  const stored = await preparePassword(password, 'member', ctx.breachCheck);
  try {
    await ctx.runtime.transaction(async (tx) => {
      const [intent] = await tx
        .select()
        .from(schema.intents)
        .where(eq(schema.intents.tokenHash, digest(rawToken)))
        .for('update');
      if (
        !intent ||
        intent.state !== 'issued' ||
        !intent.expiresAt ||
        intent.expiresAt.getTime() <= Date.now() ||
        // ADR 0019: removing an email from the invite list also stops links already sent.
        !registrationAllowed(ctx.settings.registration, intent.email)
      )
        throw new DomainError('token_invalid');
      const context = await createAuth(tx, ctx.settings.secret, ctx.settings.origin).$context;
      const created = await context.adapter.create<{ id: string }>({
        model: 'user',
        data: {
          email: intent.email,
          name: handle,
          emailVerified: true,
          accountKind: 'member',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
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
      await tx.insert(schema.profiles).values({ userId: created.id, handle });
      await tx.insert(schema.security).values({ userId: created.id, passwordChangedAt: new Date() });
      await tx
        .update(schema.intents)
        .set({ state: 'completed', completedAt: new Date() })
        .where(eq(schema.intents.id, intent.id));
      await appendAudit(
        tx,
        { kind: 'system', actorRef: 'identity.registration', jobKind: 'identity.registration' },
        'account.registered',
        'account',
        await actorReference(tx, created.id),
      );
    });
  } catch (error) {
    if (error instanceof DomainError) throw error;
    // Unique-email/handle races do not reveal private account state.
    throw new DomainError('token_invalid');
  }
  const [intent] = await ctx.runtime.db
    .select()
    .from(schema.intents)
    .where(eq(schema.intents.tokenHash, digest(rawToken)));
  if (!intent) throw new DomainError('temporarily_unavailable');
  return signIn(ctx, intent.email, password);
}
