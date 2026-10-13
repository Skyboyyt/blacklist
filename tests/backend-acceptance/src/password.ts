import { hash, verify, type Options } from '@node-rs/argon2';

// Argon2id is the library's documented numeric value 2. Its ambient const enum
// cannot be imported under the repository's verbatimModuleSyntax policy.
export const ARGON2_POLICY = {
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} satisfies Options;
export function normalizePassword(input: string) {
  const normalized = input.normalize('NFKC');
  const length = [...normalized].length;
  if (
    length < 8 ||
    length > 128 ||
    Buffer.byteLength(normalized, 'utf8') > 512 ||
    /\p{Cc}/u.test(normalized)
  ) {
    throw new Error('password_policy_rejected');
  }
  return normalized;
}
// Bound memory and hashing work. Each admitted job uses ~19 MiB.
let pending = Promise.resolve();
export function hashPassword(input: string): Promise<string> {
  const password = normalizePassword(input);
  const operation = pending.then(() => hash(password, ARGON2_POLICY));
  pending = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}
export async function verifyPassword({ hash: stored, password }: { hash: string; password: string }) {
  return verify(stored, normalizePassword(password));
}
export function needsRehash(stored: string) {
  return !stored.startsWith('$argon2id$v=19$m=19456,t=2,p=1$');
}
