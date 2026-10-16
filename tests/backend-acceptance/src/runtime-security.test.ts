import { randomBytes } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { readApiConfig, readWorkerConfig, resolveRegistrationAccess } from '@blacklist/config';
import { ipPrefix, hasPermission, isPermission, type UserActor } from '@blacklist/domain';
import {
  preparePassword,
  checkBreach,
  validateHandle,
} from '../../../packages/domain/src/identity/password-policy.ts';
import {
  normalizePassword,
  hashPassword,
  verifyPassword,
} from '../../../packages/domain/src/identity/password.ts';
const env = {
  DATABASE_URL: 'postgresql://fictional@localhost/fictional',
  APP_ORIGIN: 'http://localhost:3000',
  BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
  INTERNAL_API_TOKEN: randomBytes(32).toString('hex'),
  WEBAUTHN_RP_ID: 'localhost',
};
describe('runtime security/configuration boundaries', () => {
  it('defaults hosted services to invite-only registration and accepts only digest lists (ADR 0019)', () => {
    const invited = 'a'.repeat(64);
    expect(resolveRegistrationAccess(readApiConfig(env))).toEqual({ mode: 'open' });
    const hosted = resolveRegistrationAccess(
      readApiConfig({ ...env, NODE_ENV: 'production', APP_ORIGIN: 'https://localhost' }),
    );
    expect(hosted.mode).toBe('invite');
    expect(hosted.mode === 'invite' && hosted.emailDigests.size).toBe(0);
    const listed = resolveRegistrationAccess(
      readApiConfig({
        ...env,
        REGISTRATION_MODE: 'invite',
        REGISTRATION_INVITE_EMAILS_SHA256: `${invited}, `,
      }),
    );
    expect(listed.mode === 'invite' && [...listed.emailDigests]).toEqual([invited]);
    expect(() => readApiConfig({ ...env, REGISTRATION_INVITE_EMAILS_SHA256: 'person@example.test' })).toThrow(
      'REGISTRATION_INVITE_EMAILS_SHA256',
    );
    expect(() => readApiConfig({ ...env, REGISTRATION_MODE: 'public' })).toThrow('REGISTRATION_MODE');
  });
  it('rejects malformed configuration without exporting secret values; RP and TLS boundaries fail closed', () => {
    expect(() => readApiConfig({ ...env, DATABASE_URL: 'sensitive-input' })).toThrow('DATABASE_URL');
    expect(() => readApiConfig({ ...env, DATABASE_URL: 'sensitive-input' })).not.toThrow('sensitive-input');
    expect(() => readApiConfig({ ...env, WEBAUTHN_RP_ID: 'foreign.example' })).toThrow('WEBAUTHN_RP_ID');
    expect(() =>
      readWorkerConfig({
        ...env,
        NODE_ENV: 'production',
        SMTP_HOST: 'localhost',
        SMTP_PORT: '1025',
        SMTP_SECURE: 'false',
        EMAIL_FROM: 'security@example.test',
      }),
    ).toThrow('SMTP_SECURE');
    expect(Object.isFrozen(readApiConfig(env))).toBe(true);
  });
  it('enforces the owner-requested eight-code-point boundary without changing normalization or hashing', async () => {
    expect(() => normalizePassword('a'.repeat(7))).toThrow('password_policy_rejected');
    expect(normalizePassword('Ａ'.repeat(8))).toBe('A'.repeat(8));
    const stored = await hashPassword('Ａ'.repeat(8));
    expect(await verifyPassword({ hash: stored, password: 'A'.repeat(8) })).toBe(true);
    expect(await verifyPassword({ hash: stored, password: 'B'.repeat(8) })).toBe(false);
  });
  it('still blocks common eight-character passwords during a breach-provider outage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('provider unavailable')));
    try {
      for (const value of ['password', '12345678', 'blacklist', 'qwertyui'])
        await expect(preparePassword(value, 'staff')).rejects.toThrow('password_breached');
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('requires 12 code points for member passwords and 8 for staff (ADR 0016 amendment)', async () => {
    const accept = async () => false;
    await expect(preparePassword('fictional11', 'member', accept)).rejects.toThrow(
      'password_policy_rejected',
    );
    await expect(preparePassword('fictional112', 'member', accept)).resolves.toMatch(/^\$argon2id\$/);
    await expect(preparePassword('fiction8', 'staff', accept)).resolves.toMatch(/^\$argon2id\$/);
    await expect(preparePassword('fiction', 'staff', accept)).rejects.toThrow('password_policy_rejected');
    // Existing member passwords of 8–11 characters still verify (no forced reset).
    expect(normalizePassword('fiction8')).toBe('fiction8');
  });
  it('normalizes IPv6 /64 and mapped IPv4 buckets without admitting arbitrary prefixes', () => {
    expect(ipPrefix('2001:db8:1234:5678::1')).toBe(ipPrefix('2001:0db8:1234:5678:abcd:efab:0:2'));
    expect(ipPrefix('::ffff:192.0.2.3')).toBe('ip4:192.0.2.3');
    expect(() => ipPrefix('untrusted-header')).toThrow();
  });
  it('defaults to deny for unknown permissions, members with forged roles and unassured/deficient staff', () => {
    const actor: UserActor = {
      kind: 'user',
      userId: 'fictional',
      sessionId: 'fictional',
      actorRef: 'fictional',
      accountKind: 'staff',
      roles: ['admin'],
      staffAssured: true,
      staffPermissionsActive: true,
      securityVersion: 1,
    };
    expect(hasPermission(actor, 'staff:invite')).toBe(true);
    expect(isPermission('unregistered:permission')).toBe(false);
    expect(hasPermission({ ...actor, accountKind: 'member' }, 'staff:invite')).toBe(false);
    expect(hasPermission({ ...actor, staffAssured: false }, 'staff:invite')).toBe(false);
    expect(hasPermission({ ...actor, staffPermissionsActive: false }, 'staff:invite')).toBe(false);
  });
  it('rejects controls, overlength input, reserved/confusable handles and never truncates credentials', () => {
    for (const value of ['a'.repeat(129), 'a long\u0000password string', 'a long\u202epassword string'])
      expect(() => normalizePassword(value)).toThrow();
    expect(normalizePassword('Ａ'.repeat(15))).toBe('A'.repeat(15));
    for (const handle of ['admin', 'adm1n', '__admin__', 'Ａdmin'])
      expect(() => validateHandle(handle)).toThrow();
    expect(validateHandle('fictional_member')).toBe('fictional_member');
  });
  it('uses the bundled breach blocklist on outage and honors positive range responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('provider unavailable')));
    try {
      expect(await checkBreach('blacklistpassword')).toBe(true);
      expect(await checkBreach('fictional independent long phrase')).toBe(false);
      await expect(preparePassword('blacklistpassword', 'member')).rejects.toThrow('password_breached');
      await expect(
        preparePassword('fictional independent long phrase', 'member', async () => true),
      ).rejects.toThrow('password_breached');
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('verifies Argon2id after NFKC and rejects a different password with real bounded hashing', async () => {
    const hash = await hashPassword('Ａ'.repeat(15));
    expect(hash).toContain('$argon2id$v=19$m=19456,t=2,p=1$');
    expect(await verifyPassword({ hash, password: 'A'.repeat(15) })).toBe(true);
    expect(await verifyPassword({ hash, password: 'B'.repeat(15) })).toBe(false);
  });
});
