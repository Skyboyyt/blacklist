import { randomBytes } from 'node:crypto';
import { schema } from '@blacklist/db';
import { createIdentity } from '@blacklist/domain';
import { hashPassword } from '../../../packages/domain/src/identity/password.ts';
import { migrate } from '../../../packages/db/src/migrate.ts';
import { startDatabase, type Harness } from './database.ts';

export const syntheticPassword = 'isolated identity passphrase';
export const syntheticOrigin = 'https://blacklist.example.invalid';

export function fixtureUrl(h: Harness, role: 'runtime' | 'migrator') {
  const pool = h[role],
    url = new URL(`postgresql://127.0.0.1:${h.port}/postgres`);
  url.username = pool.options.user ?? '';
  if (typeof pool.options.password !== 'string') throw new Error('fixture_password_missing');
  url.password = pool.options.password;
  return url.toString();
}

/** Synthetic fixtures only; never accepts a remote database or real account. */
export async function startApplicationFixture() {
  const h = await startDatabase();
  const ctx = createIdentity(
    fixtureUrl(h, 'runtime'),
    {
      secret: randomBytes(32).toString('hex'),
      origin: syntheticOrigin,
      rpId: 'blacklist.example.invalid',
      rpName: 'Blacklist test',
      breakGlassEnabled: false,
    },
    { breach: async () => false },
  );
  try {
    await migrate(fixtureUrl(h, 'migrator'), 'gate_runtime');
    await ctx.runtime.start();
    const passwordHash = await hashPassword(syntheticPassword);
    return {
      h,
      ctx,
      async addUser(kind: 'member' | 'staff' = 'member', credential = true) {
        const suffix = randomBytes(8).toString('hex');
        const [user] = await ctx.runtime.db
          .insert(schema.user)
          .values({
            name: 'Synthetic fixture',
            email: `fixture-${suffix}@example.test`,
            emailVerified: true,
            accountKind: kind,
          })
          .returning();
        if (!user) throw new Error('fixture_user_missing');
        await ctx.runtime.db.insert(schema.security).values({ userId: user.id });
        await ctx.runtime.db.insert(schema.profiles).values({ userId: user.id, handle: `fixture_${suffix}` });
        if (credential)
          await ctx.runtime.db.insert(schema.account).values({
            userId: user.id,
            accountId: user.id,
            providerId: 'credential',
            password: passwordHash,
          });
        return user;
      },
      async stop() {
        await ctx.runtime.close();
        await h.stop();
      },
    };
  } catch (error) {
    await ctx.runtime.close();
    await h.stop();
    throw error;
  }
}
export type ApplicationFixture = Awaited<ReturnType<typeof startApplicationFixture>>;
