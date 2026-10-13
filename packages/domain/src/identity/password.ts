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
    length < 15 ||
    length > 128 ||
    Buffer.byteLength(normalized, 'utf8') > 512 ||
    /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(normalized)
  ) {
    throw new Error('password_policy_rejected');
  }
  return normalized;
}
// Bound memory and hashing work. Each admitted job uses ~19 MiB.
let active = 0;
const waiting: Array<() => void> = [];
async function passwordWork<T>(run: () => Promise<T>): Promise<T> {
  if (active >= 2) {
    if (waiting.length >= 32) throw new Error('password_work_capacity');
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else active++;
  try {
    return await run();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}
export function hashPassword(input: string): Promise<string> {
  const password = normalizePassword(input);
  return passwordWork(() => hash(password, ARGON2_POLICY));
}
export async function verifyPassword({ hash: stored, password }: { hash: string; password: string }) {
  return passwordWork(() => verify(stored, normalizePassword(password)));
}
export function needsRehash(stored: string) {
  return !stored.startsWith('$argon2id$v=19$m=19456,t=2,p=1$');
}
