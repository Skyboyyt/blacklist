import type { RegistrationAccess } from '@blacklist/config';
import { digest } from '../shared/crypto.ts';

/** ADR 0019. `email` is already normalized (trimmed, lower-cased) at the boundary. */
export function registrationAllowed(access: RegistrationAccess, email: string): boolean {
  return access.mode === 'open' || access.emailDigests.has(digest(email));
}
