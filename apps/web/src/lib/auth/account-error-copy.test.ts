import { accountErrorCodeSchema } from '@blacklist/contracts';
import { describe, expect, it } from 'vitest';
import { accountErrorCopy, approximateWait, rateLimitCopy } from './account-error-copy';

describe('account error copy', () => {
  it('covers every error code with calm, non-revealing text', () => {
    for (const code of accountErrorCodeSchema.options) {
      const copy = accountErrorCopy({ kind: 'error', code });
      expect(copy.title.length).toBeGreaterThan(0);
      const text = `${copy.title} ${copy.body}`.toLowerCase();
      expect(text).not.toMatch(
        /no account|not registered|unknown email|does not exist|user not found|disabled|locked/,
      );
      expect(text).not.toMatch(/something went wrong|error code|exception|stack/);
    }
  });

  it('approximates waits instead of promising exact countdowns', () => {
    expect(approximateWait(undefined)).toBeNull();
    expect(approximateWait(30)).toBe('about a minute');
    expect(approximateWait(300)).toBe('about 5 minutes');
    expect(approximateWait(3 * 3600)).toBe('about 3 hours');
    expect(rateLimitCopy().body).toMatch(/a little later/);
    expect(rateLimitCopy(600).body).toMatch(/about 10 minutes/);
  });

  it('shows the cooling period end time when known', () => {
    expect(
      accountErrorCopy({ kind: 'error', code: 'cooling_period', until: '2026-10-08T09:00:00Z' }).body,
    ).toMatch(/8 Oct 2026, 09:00 UTC/);
  });
});
