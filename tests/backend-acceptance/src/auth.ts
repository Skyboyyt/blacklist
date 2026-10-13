import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { eq } from 'drizzle-orm';
import type { GateDatabase } from './database.js';
import * as schema from './schema.js';
import { hashPassword, verifyPassword } from './password.js';

export function assertHeadlessOptions(options: BetterAuthOptions) {
  if (
    options.plugins?.length ||
    Object.keys(options.socialProviders ?? {}).length ||
    options.session?.cookieCache?.enabled ||
    options.rateLimit?.enabled ||
    options.emailVerification ||
    options.emailAndPassword?.sendResetPassword ||
    options.user?.changeEmail?.enabled ||
    options.user?.deleteUser?.enabled ||
    options.account?.accountLinking?.enabled
  ) {
    throw new Error('forbidden_auth_configuration');
  }
}
export function authOptions(
  db: GateDatabase,
  secret: string,
  origin = 'http://localhost:4107',
): BetterAuthOptions {
  return {
    baseURL: origin,
    secret,
    database: drizzleAdapter(db, { provider: 'pg', schema, transaction: true }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 15,
      maxPasswordLength: 512,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    user: {
      additionalFields: {
        accountKind: { type: 'string', required: true, defaultValue: 'member', input: false },
        status: { type: 'string', required: true, defaultValue: 'active', input: false },
      },
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
    },
    session: { expiresIn: 30 * 86400, updateAge: 86400, cookieCache: { enabled: false } },
    verification: { storeIdentifier: 'hashed' },
    // The automatic __Secure- prefix must be off; the explicitly named cookie
    // still has Secure=true. This is supported cookie configuration, not a TLS bypass.
    advanced: {
      useSecureCookies: false,
      database: { generateId: false, joins: true },
      crossSubDomainCookies: { enabled: false },
      cookies: {
        session_token: {
          name: '__Host-bl_session',
          attributes: { httpOnly: true, secure: true, sameSite: 'lax', path: '/' },
        },
      },
      ipAddress: { disableIpTracking: true },
    },
    account: { accountLinking: { enabled: false } },
    rateLimit: { enabled: false },
    trustedOrigins: [origin],
    telemetry: { enabled: false },
    logger: { disabled: true },
    plugins: [],
  };
}
export function createAuth(db: GateDatabase, secret: string, origin?: string) {
  const options = authOptions(db, secret, origin);
  assertHeadlessOptions(options);
  return betterAuth(options);
}
export type GateAuth = ReturnType<typeof createAuth>;

export async function validSession(db: GateDatabase, auth: GateAuth, headers: Headers) {
  const result = await auth.api.getSession({ headers, returnHeaders: true });
  if (!result.response) return null;
  const s = result.response.session;
  const [policy] = await db.select().from(schema.policy).where(eq(schema.policy.sessionId, s.id));
  const [security] = await db.select().from(schema.security).where(eq(schema.security.userId, s.userId));
  const [user] = await db.select().from(schema.user).where(eq(schema.user.id, s.userId));
  if (
    !policy ||
    !security ||
    !user ||
    user.status !== 'active' ||
    policy.securityVersion !== security.securityVersion
  )
    return null;
  const now = Date.now();
  const staff = user.accountKind === 'staff';
  if (
    staff ||
    now - policy.createdAt.getTime() > 30 * 86400_000 ||
    now - policy.lastActivityAt.getTime() > 7 * 86400_000
  )
    return null;
  return { userId: s.userId, sessionId: s.id };
}
