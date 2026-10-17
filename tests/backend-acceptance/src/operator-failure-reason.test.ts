import { describe, it, expect } from 'vitest';
import { DomainError } from '@blacklist/domain';
import { operatorFailureReason } from '../../../apps/api/src/cli/failure-reason.ts';

describe('operator CLI failure reasons', () => {
  it('names domain refusals and the role check, and nothing from other errors', () => {
    expect(operatorFailureReason(new DomainError('forbidden'))).toBe('forbidden');
    expect(operatorFailureReason(new Error('runtime_database_role_rejected'))).toBe('database_role_rejected');
    const leaky = new Error('connect failed: postgresql://user:secret@host/db');
    expect(operatorFailureReason(leaky)).not.toContain('secret');
    expect(operatorFailureReason(leaky)).toMatch(/^unavailable/);
    expect(operatorFailureReason('not an error')).toMatch(/^unavailable/);
  });
});
