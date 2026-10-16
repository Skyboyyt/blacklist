// Prints the SHA-256 digest of an invited email for REGISTRATION_INVITE_EMAILS_SHA256 (ADR 0019).
// The email is trimmed and lower-cased exactly as the API does. Nothing is stored or sent.
// Usage: node scripts/registration-invite-hash.mjs person@example.com [more@example.com ...]
import { createHash } from 'node:crypto';

const emails = process.argv.slice(2);
if (emails.length === 0) {
  console.error('Usage: node scripts/registration-invite-hash.mjs <email> [<email> ...]');
  process.exit(1);
}
const digests = emails.map((email) => createHash('sha256').update(email.trim().toLowerCase()).digest('hex'));
console.log(digests.join(','));
