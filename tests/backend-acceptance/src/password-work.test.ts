import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../../packages/domain/src/identity/password.ts';
describe('password work admission bounds', () => {
  it('runs at most two jobs with at most32queued admissions, rejects excess work and recovers capacity', async () => {
    const outcomes = await Promise.allSettled(
      Array.from({ length: 40 }, () => hashPassword('isolated work-budget phrase')),
    );
    const accepted = outcomes.filter((o) => o.status === 'fulfilled'),
      rejected = outcomes.filter((o) => o.status === 'rejected');
    expect(accepted).toHaveLength(34);
    expect(rejected).toHaveLength(6);
    for (const error of rejected)
      expect(error.reason instanceof Error && error.reason.message === 'password_work_capacity').toBe(true);
    const next = await hashPassword('next isolated budget phrase');
    expect(await verifyPassword({ hash: next, password: 'next isolated budget phrase' })).toBe(true);
  });
});
