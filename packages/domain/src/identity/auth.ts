import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { schema, type Database } from '@blacklist/db';
import { hashPassword, verifyPassword } from './password.ts';

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
  db: Database,
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
      minPasswordLength: 8,
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
export function createAuth(db: Database, secret: string, origin?: string) {
  const options = authOptions(db, secret, origin);
  assertHeadlessOptions(options);
  return betterAuth(options);
}
export type IdentityAuth = ReturnType<typeof createAuth>;
