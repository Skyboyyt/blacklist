import { describe, expect, it } from 'vitest';
import { isActive, navSectionsFor, PRIMARY_NAV } from './nav-items';

describe('navigation', () => {
  it('includes the required primary destinations', () => {
    const labels = PRIMARY_NAV.items.map((i) => i.label);
    expect(labels).toEqual(
      expect.arrayContaining(['Research', 'Dashboard', 'Reports', 'Appeals & responses']),
    );
  });

  it('shows the staff section only to staff viewers (layout only, not access control)', () => {
    const ids = (role: 'member' | 'moderator' | 'admin') =>
      navSectionsFor({ kind: 'signed_in', handle: 'x', role, emailVerified: true }).map((s) => s.id);
    expect(ids('member')).toEqual(['primary', 'account']);
    expect(ids('moderator')).toContain('staff');
    expect(ids('admin')).toContain('staff');
    expect(navSectionsFor({ kind: 'anonymous' }).map((s) => s.id)).toEqual(['primary']);
  });

  it('marks nested routes active by prefix without false prefix matches', () => {
    const reports = PRIMARY_NAV.items.find((i) => i.label === 'Reports');
    expect(reports && isActive(reports, '/reports/new')).toBe(true);
    expect(reports && isActive(reports, '/reportsx')).toBe(false);
  });

  it('shows staff links by role: appeal reviewers see appeals only, the administration console is for administrators', () => {
    const staffLinks = (role: 'moderator' | 'admin' | 'appeal_reviewer') =>
      navSectionsFor({ kind: 'signed_in', handle: 'x', role, emailVerified: true })
        .find((s) => s.id === 'staff')
        ?.items.map((i) => i.href);
    expect(staffLinks('appeal_reviewer')).toEqual(['/mod/appeals']);
    expect(staffLinks('moderator')).not.toContain('/admin');
    expect(staffLinks('moderator')).toContain('/mod/findings');
    expect(staffLinks('moderator')).toContain('/mod/recovery');
    expect(staffLinks('admin')).toContain('/admin');
  });
});
