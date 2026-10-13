import { schema, eq, and } from '@blacklist/db';
import { createAuth } from './auth.ts';
import { normalizePassword, hashPassword, needsRehash } from './password.ts';
import { DomainError } from '../shared/errors.ts';
import type { IdentityContext } from './types.ts';
import { securityEvent } from './telemetry.ts';

export async function signIn(ctx: IdentityContext, email: string, input: string) {
  let password: string;
  try {
    password = normalizePassword(input);
  } catch {
    throw new DomainError('invalid_credentials');
  }
  const headers = new Headers({ origin: ctx.settings.origin });
  const [user] = await ctx.runtime.db.select().from(schema.user).where(eq(schema.user.email, email));
  if (!user) {
    // Better Auth performs its configured dummy hash. Never substitute a quick
    // account lookup failure for the library's unknown-user path.
    await ctx.auth.api.signInEmail({ body: { email, password }, headers, returnHeaders: true });
    throw new DomainError('invalid_credentials');
  }
  return ctx.runtime.transaction(async (tx) => {
    const [state] = await tx
      .select()
      .from(schema.security)
      .where(eq(schema.security.userId, user.id))
      .for('update');
    if (!state) throw new DomainError('invalid_credentials');
    const transactional = createAuth(tx, ctx.settings.secret, ctx.settings.origin);
    const result = await transactional.api.signInEmail({
      body: { email, password },
      headers,
      returnHeaders: true,
    });
    const [current] = await tx.select().from(schema.user).where(eq(schema.user.id, user.id));
    const [s] = await tx.select().from(schema.session).where(eq(schema.session.token, result.response.token));
    if (!s || current?.status !== 'active' || state.staffRecoveryPending)
      throw new DomainError('invalid_credentials');
    await tx.insert(schema.policy).values({
      sessionId: s.id,
      userId: user.id,
      accountKind: current.accountKind,
      securityVersion: state.securityVersion,
    });
    const [credential] = await tx
      .select()
      .from(schema.account)
      .where(and(eq(schema.account.userId, user.id), eq(schema.account.providerId, 'credential')));
    if (credential?.password && needsRehash(credential.password))
      await tx
        .update(schema.account)
        .set({ password: await hashPassword(password), updatedAt: new Date() })
        .where(eq(schema.account.id, credential.id));
    // No raw library response escapes this function. Cookie is the only auth output.
    return {
      staffVerificationRequired: current.accountKind === 'staff',
      cookies: result.headers.getSetCookie(),
    };
  });
}
export async function login(
  ctx: IdentityContext,
  email: string,
  password: string,
  prefix: string,
  humanResponse?: string,
) {
  const [candidate] = await ctx.runtime.db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email));
  await ctx.throttle.admit(email, prefix, humanResponse, candidate?.id);
  try {
    const result = await signIn(ctx, email, password);
    const [user] = await ctx.runtime.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, email));
    await ctx.throttle.success(email, prefix, user?.id);
    await securityEvent(ctx.runtime.db, user?.id ?? null, 'login_succeeded', prefix);
    return result;
  } catch (error) {
    const [user] = await ctx.runtime.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, email));
    await ctx.throttle.failure(email, prefix, user?.id);
    await securityEvent(ctx.runtime.db, user?.id ?? null, 'login_failed', prefix);
    // Credentials and account status share the same public error.
    if (error instanceof DomainError) throw error;
    if (
      error instanceof Error &&
      'statusCode' in error &&
      Number(error.statusCode) >= 400 &&
      Number(error.statusCode) < 500
    )
      throw new DomainError('invalid_credentials');
    throw new DomainError('temporarily_unavailable');
  }
}
