import { createHash } from 'node:crypto';
import { normalizePassword, hashPassword } from './password.ts';
import { DomainError } from '../shared/errors.ts';

// Bundled denylist applies even when the range service is unavailable. Context
// terms are denied as complete phrases, rather than rejecting ordinary words.
const blocked = new Set([
  'passwordpassword',
  'password123456789',
  '123456789012345',
  'qwertyuiopasdfgh',
  'letmeinletmeinletmein',
  'blacklistblacklist',
  'blacklistpassword',
  'blacklist123456789',
  'correct horse battery staple',
]);
export type BreachCheck = (normalized: string) => Promise<boolean>;
export const checkBreach: BreachCheck = async (password) => {
  const value = createHash('sha1').update(password).digest('hex').toUpperCase();
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${value.slice(0, 5)}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('breach_service_unavailable');
    const body = await response.text();
    if (body.length > 2_000_000) throw new Error('invalid_breach_response');
    const lines = body.split(/\r?\n/u).filter(Boolean);
    if (!lines.length || lines.some((line) => !/^([A-F0-9]{35}):([0-9]+)$/u.test(line)))
      throw new Error('invalid_breach_response');
    if (lines.some((line) => line.startsWith(value.slice(5) + ':') && Number(line.split(':')[1]) > 0))
      return true;
  } catch {
    /* documented bundled fallback; never unconditional acceptance */
  }
  return blocked.has(password.toLowerCase());
};
export async function preparePassword(input: string, breachCheck: BreachCheck = checkBreach) {
  let normalized: string;
  try {
    normalized = normalizePassword(input);
  } catch {
    throw new DomainError('password_policy_rejected');
  }
  if (blocked.has(normalized.toLowerCase()) || (await breachCheck(normalized)))
    throw new DomainError('password_breached');
  return hashPassword(normalized);
}
const reserved = new Set([
  'admin',
  'administrator',
  'blacklist',
  'moderator',
  'support',
  'security',
  'system',
  'staff',
  'root',
  'api',
  'www',
  'help',
  'official',
]);
export function validateHandle(input: string) {
  const handle = input.normalize('NFKC').toLowerCase();
  if (
    handle !== input ||
    !/^[a-z0-9_]{3,30}$/u.test(handle) ||
    reserved.has(handle) ||
    reserved.has(handle.replaceAll('0', 'o').replaceAll('1', 'l').replaceAll('_', '')) ||
    reserved.has(handle.replaceAll('0', 'o').replaceAll('1', 'i').replaceAll('_', ''))
  )
    throw new DomainError('handle_unavailable');
  return handle;
}
