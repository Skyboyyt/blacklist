import { afterAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createDatabase } from '@blacklist/db';
import { hasPermission, type UserActor } from '@blacklist/domain';
import { requireOwner, requirePermission } from '../../../packages/domain/src/access/policies.ts';
import { appendAudit } from '../../../packages/domain/src/audit/service.ts';
import { checkBreach, preparePassword } from '../../../packages/domain/src/identity/password-policy.ts';

const runtime = createDatabase('postgresql://127.0.0.1:1/postgres');
afterAll(() => runtime.close());
const actor: UserActor = {
  kind: 'user',
  userId: 'synthetic-account',
  sessionId: 'synthetic-session',
  actorRef: 'synthetic-actor',
  accountKind: 'member',
  roles: [],
  staffAssured: false,
  staffPermissionsActive: false,
  securityVersion: 1,
};
describe('foundation authorization, audit privacy and breach-provider negatives', () => {
  it('hides another owner resource and prevents forged member/staff role escalation', () => {
    expect(() => requireOwner(actor, 'another-account')).toThrow('not_found');
    expect(() => requireOwner(actor, actor.userId)).not.toThrow();
    expect(() => requirePermission(actor, 'staff:invite')).toThrow('forbidden');
    expect(() => requirePermission(actor, 'profile:update:own')).not.toThrow();
    const staff = {
      ...actor,
      accountKind: 'staff' as const,
      staffAssured: true,
      staffPermissionsActive: true,
    };
    expect(hasPermission({ ...staff, roles: ['moderator'] }, 'staff:recovery:verify')).toBe(true);
    expect(hasPermission({ ...staff, roles: ['moderator'] }, 'staff:invite')).toBe(false);
    expect(hasPermission({ ...staff, roles: ['appeal_reviewer'] }, 'staff:recovery:verify')).toBe(false);
    expect(hasPermission({ ...staff, staffAssured: false }, 'session:manage:own')).toBe(false);
    expect(hasPermission({ ...actor, roles: ['admin'] }, 'staff:invite')).toBe(false);
  });
  it('rejects unknown audit actions and private/free-form/oversized details before database access', async () => {
    const query = vi.spyOn(runtime.pool, 'query');
    await expect(
      Reflect.apply(appendAudit, undefined, [
        runtime.db,
        actor,
        'unapproved.audit',
        'account',
        actor.actorRef,
      ]),
    ).rejects.toThrow('unknown_audit_action');
    const rejectedDetails: Record<string, string>[] = [
      { email: 'synthetic@example.test' },
      { reason: 'private narrative' },
      { role: 'x'.repeat(81) },
    ];
    for (const details of rejectedDetails)
      await expect(
        appendAudit(runtime.db, actor, 'staff.invitation.created', 'invitation', 'synthetic-id', details),
      ).rejects.toThrow('audit_details_rejected');
    expect(query).not.toHaveBeenCalled();
    query.mockRestore();
  });
  it('checks only a SHA1 prefix, ignores zero-count padding and uses bundled policy on hostile/outage responses', async () => {
    const password = 'fictional distinct long test phrase',
      hash = createHash('sha1').update(password).digest('hex').toUpperCase();
    const fetcher = vi.fn(async () => new Response(hash.slice(5) + ':1', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    try {
      expect(await checkBreach(password)).toBe(true);
      // Assert the actual public request without exposing the password or its full hash.
      expect(fetcher).toHaveBeenCalledWith(
        'https://api.pwnedpasswords.com/range/' + hash.slice(0, 5),
        expect.objectContaining({ redirect: 'error', headers: { 'Add-Padding': 'true' } }),
      );
      fetcher.mockImplementation(async () => new Response(hash.slice(5) + ':0'));
      expect(await checkBreach(password)).toBe(false);
      for (const body of ['', 'malformed', 'x'.repeat(2_000_001)]) {
        fetcher.mockImplementation(async () => new Response(body));
        expect(await checkBreach('password')).toBe(true);
        expect(await checkBreach(password)).toBe(false);
      }
      fetcher.mockImplementation(async () => new Response(null, { status: 503 }));
      expect(await checkBreach('password')).toBe(true);
      await expect(preparePassword('short', 'staff')).rejects.toThrow('password_policy_rejected');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
