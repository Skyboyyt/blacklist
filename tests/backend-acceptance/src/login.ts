import { eq, sql } from 'drizzle-orm';
import { createAuth, type GateAuth } from './auth.js';
import type { Harness } from './database.js';
import { hashPassword, needsRehash, normalizePassword } from './password.js';
import * as schema from './schema.js';

export async function login(
  h: Harness,
  auth: GateAuth,
  secret: string,
  email: string,
  input: string,
  origin?: string,
) {
  const password = normalizePassword(input);
  const normalizedEmail = email.trim().toLowerCase();
  const headers = new Headers({ origin: origin ?? 'http://localhost:4107' });
  const [user] = await h.db.select().from(schema.user).where(eq(schema.user.email, normalizedEmail));
  if (!user)
    return auth.api.signInEmail({ body: { email: normalizedEmail, password }, headers, returnHeaders: true });
  // Keep verification and session stamping in the same account-serialized
  // transaction as reset. A credential checked before reset cannot acquire its new version.
  return h.transaction(async (tx) => {
    const [state] = await tx
      .select()
      .from(schema.security)
      .where(eq(schema.security.userId, user.id))
      .for('update');
    if (!state) throw new Error('sign_in_rejected');
    const [currentUser] = await tx.select().from(schema.user).where(eq(schema.user.id, user.id));
    const transactional = createAuth(tx, secret, origin);
    const result = await transactional.api.signInEmail({
      body: { email: normalizedEmail, password },
      headers,
      returnHeaders: true,
    });
    const [created] = await tx
      .select()
      .from(schema.session)
      .where(eq(schema.session.token, result.response.token));
    if (!created || currentUser?.status !== 'active') throw new Error('sign_in_rejected');
    await tx.insert(schema.policy).values({
      sessionId: created.id,
      userId: user.id,
      accountKind: currentUser.accountKind,
      securityVersion: state.securityVersion,
    });
    const [credential] = await tx.select().from(schema.account).where(eq(schema.account.userId, user.id));
    if (credential?.password && needsRehash(credential.password)) {
      await tx
        .update(schema.account)
        .set({ password: await hashPassword(password), updatedAt: new Date() })
        .where(eq(schema.account.id, credential.id));
    }
    await tx.execute(sql`select 1`);
    return result;
  });
}
