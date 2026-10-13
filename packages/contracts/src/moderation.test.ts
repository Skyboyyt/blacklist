import { describe, expect, it } from 'vitest';
import { caseDecisionSchema, revisionBaseSchema, revisionDraftSchema } from './moderation.ts';

const summary = 'Payments reached this address after a fake support chat.';
const rationale = 'Two further reports confirmed the pattern.';

describe('finding revisions and appeal amendments (moderation §2, §8.1, §9)', () => {
  it('an amendment carries the new severity and summary; uphold and reverse do not', () => {
    const amend = {
      action: 'amend',
      severity: 'medium',
      publicSummary: summary,
      internalRationale: rationale,
    };
    expect(caseDecisionSchema.safeParse(amend).success).toBe(true);
    expect(caseDecisionSchema.safeParse({ ...amend, severity: undefined }).success).toBe(false);
    expect(caseDecisionSchema.safeParse({ ...amend, action: 'uphold' }).success).toBe(false);
    expect(
      caseDecisionSchema.safeParse({
        action: 'reverse',
        publicSummary: summary,
        internalRationale: rationale,
      }).success,
    ).toBe(true);
  });

  it('a draft holds only revision content; the base names an exact revision and hash', () => {
    const draft = { severity: 'high', publicSummary: summary, internalRationale: rationale };
    expect(revisionDraftSchema.safeParse(draft).success).toBe(true);
    for (const extra of [{ status: 'published' }, { author: 'x' }, { contentHash: 'a'.repeat(16) }]) {
      expect(revisionDraftSchema.safeParse({ ...draft, ...extra }).success).toBe(false);
    }
    expect(revisionBaseSchema.safeParse({ revisionNumber: 1, contentHash: 'a'.repeat(16) }).success).toBe(
      true,
    );
    expect(revisionBaseSchema.safeParse({ revisionNumber: 1, contentHash: 'not-a-hash' }).success).toBe(
      false,
    );
    expect(revisionBaseSchema.safeParse({ revisionNumber: 0, contentHash: 'a'.repeat(16) }).success).toBe(
      false,
    );
  });
});
