import { describe, expect, it } from 'vitest';
import {
  accountSecuritySchema,
  emailChangeRequestSchema,
  passwordChangeFormSchema,
  securityEventSchema,
  sessionSummarySchema,
} from './account.ts';
import { tokenStatusSchema } from './auth.ts';
import { addressResearchSchema } from './research.ts';
import { viewerSchema } from './session.ts';
import {
  enrollmentPasswordRequestSchema,
  enrollmentStartSchema,
  staffAuthenticatorSchema,
  staffRecoveryStatusSchema,
  staffSecuritySchema,
} from './staff.ts';

const at = '2026-10-05T09:00:00Z';
const session = {
  id: 'sess_demo_0001',
  current: true,
  deviceSummary: 'Firefox on Windows',
  createdAt: at,
  lastActiveAt: at,
};
const security = {
  accountKind: 'member',
  handle: 'demo_member',
  email: 'member@example.test',
  passwordChangedAt: null,
  cooling: null,
  reauthValidUntil: null,
  sessions: [session],
  recentEvents: [],
};

describe('member-private session DTO', () => {
  it('accepts a coarse device summary and opaque id', () => {
    expect(sessionSummarySchema.safeParse(session).success).toBe(true);
  });

  it.each([
    { token: 'raw-session-token' },
    { ipAddress: '203.0.113.7' },
    { location: 'Berlin' },
    { userId: 'u_1' },
    { userAgent: 'Mozilla/5.0 …' },
  ])('rejects session secrets and precise tracking data: %o', (extra) => {
    expect(sessionSummarySchema.safeParse({ ...session, ...extra }).success).toBe(false);
  });

  it('rejects security events carrying IPs or tokens', () => {
    const event = { id: 'e1', kind: 'signed_in', at, deviceSummary: 'Safari on iPhone' };
    expect(securityEventSchema.safeParse(event).success).toBe(true);
    expect(securityEventSchema.safeParse({ ...event, ip: '203.0.113.7' }).success).toBe(false);
    expect(securityEventSchema.safeParse({ ...event, token: 'x' }).success).toBe(false);
  });

  it('rejects staff fields on the member security overview', () => {
    expect(accountSecuritySchema.safeParse(security).success).toBe(true);
    expect(accountSecuritySchema.safeParse({ ...security, authenticators: [] }).success).toBe(false);
    expect(accountSecuritySchema.safeParse({ ...security, role: 'admin' }).success).toBe(false);
  });
});

describe('public / private / staff separation', () => {
  const research = {
    chain: 'ethereum',
    address: '0xb1ac000000000000000000000000000000000001',
    displayAddress: '0xb1ac000000000000000000000000000000000001',
    kind: 'wallet',
    untrustedLabel: null,
    assessment: {
      band: 'low',
      explanation: 'x',
      factors: [],
      confidence: 'high',
      coverage: 'x',
      asOf: at,
      rulesetVersion: 'v1',
      disputeState: 'none',
      suppressions: [],
    },
    facts: [],
    disclosures: [],
    labels: [],
    findings: [],
    responses: [],
    transfers: [],
    evidence: [],
    timeline: [],
  };

  it('public research rejects account, session and staff data', () => {
    expect(addressResearchSchema.safeParse(research).success).toBe(true);
    for (const extra of [
      { sessions: [session] },
      { email: 'a@example.test' },
      { securityEvents: [] },
      { authenticators: [] },
      { handle: 'x' },
    ]) {
      expect(addressResearchSchema.safeParse({ ...research, ...extra }).success).toBe(false);
    }
  });

  it('staff security DTOs carry no moderation or case data', () => {
    const staff = { role: 'moderator', authenticators: [], authenticatorDeficitSince: at };
    expect(staffSecuritySchema.safeParse(staff).success).toBe(true);
    expect(staffSecuritySchema.safeParse({ ...staff, cases: [] }).success).toBe(false);
    expect(staffSecuritySchema.safeParse({ ...staff, numericScore: 10 }).success).toBe(false);
    const authenticator = {
      id: 'a1',
      label: 'Security key',
      kind: 'security_key',
      synced: false,
      registeredAt: at,
      lastUsedAt: null,
    };
    expect(staffAuthenticatorSchema.safeParse(authenticator).success).toBe(true);
    expect(staffAuthenticatorSchema.safeParse({ ...authenticator, publicKey: 'x' }).success).toBe(false);
    expect(staffAuthenticatorSchema.safeParse({ ...authenticator, credentialId: 'x' }).success).toBe(false);
  });

  it('recovery status exposes no reviewer identities', () => {
    const status = {
      stage: 'objection_window',
      openedAt: at,
      objectionWindowEndsAt: at,
      identityVerificationsCompleted: 2,
    };
    expect(staffRecoveryStatusSchema.safeParse(status).success).toBe(true);
    expect(staffRecoveryStatusSchema.safeParse({ ...status, verifiedBy: ['admin_a'] }).success).toBe(false);
    expect(
      staffRecoveryStatusSchema.safeParse({ ...status, identityVerificationsCompleted: 3 }).success,
    ).toBe(false);
  });

  it('the anonymous viewer may say why the session ended, and nothing else', () => {
    expect(viewerSchema.safeParse({ kind: 'anonymous', reason: 'session_expired' }).success).toBe(true);
    expect(viewerSchema.safeParse({ kind: 'anonymous', reason: 'account_locked' }).success).toBe(false);
    expect(viewerSchema.safeParse({ kind: 'anonymous', email: 'a@example.test' }).success).toBe(false);
  });
});

describe('password change', () => {
  const valid = {
    currentPassword: 'old passphrase value',
    newPassword: 'a brand new passphrase',
    confirmPassword: 'a brand new passphrase',
  };

  it('applies the new-password policy and confirmation', () => {
    expect(passwordChangeFormSchema.safeParse(valid).success).toBe(true);
    expect(
      passwordChangeFormSchema.safeParse({ ...valid, newPassword: 'too short', confirmPassword: 'too short' })
        .success,
    ).toBe(false);
    expect(
      passwordChangeFormSchema.safeParse({ ...valid, confirmPassword: 'different value here' }).success,
    ).toBe(false);
  });

  it('rejects reusing the current password (after normalization)', () => {
    const same = {
      currentPassword: 'ﬁxed passphrase value',
      newPassword: 'fixed passphrase value',
      confirmPassword: 'fixed passphrase value',
    };
    expect(passwordChangeFormSchema.safeParse(same).success).toBe(false);
  });

  it('does not apply length rules to the current password (no information about stored passwords)', () => {
    expect(passwordChangeFormSchema.safeParse({ ...valid, currentPassword: 'x' }).success).toBe(true);
  });
});

describe('email change and links', () => {
  it('normalizes the new email like account emails', () => {
    expect(emailChangeRequestSchema.parse({ newEmail: ' New@Example.TEST ' })).toEqual({
      newEmail: 'new@example.test',
    });
  });

  it('knows the superseded link state', () => {
    expect(tokenStatusSchema.safeParse('superseded').success).toBe(true);
  });

  it('normalizes the enrollment code and rejects malformed ones', () => {
    const token = 'demo-invite-token-0001';
    expect(enrollmentStartSchema.parse({ token, code: 'ab12-cd34 ef' })).toEqual({
      token,
      code: 'AB12CD34EF',
    });
    expect(enrollmentStartSchema.safeParse({ token, code: 'short' }).success).toBe(false);
    expect(enrollmentStartSchema.safeParse({ token, code: 'AB12CD34E!' }).success).toBe(false);
  });
});

describe('staff enrollment password (identity §10.5 step 2)', () => {
  it('sends only the password, under the new-password policy', () => {
    expect(enrollmentPasswordRequestSchema.safeParse({ password: 'a long staff passphrase' }).success).toBe(
      true,
    );
    expect(enrollmentPasswordRequestSchema.safeParse({ password: 'too short' }).success).toBe(false);
    expect(
      enrollmentPasswordRequestSchema.safeParse({
        password: 'a long staff passphrase',
        confirmPassword: 'a long staff passphrase',
      }).success,
    ).toBe(false);
  });
});
