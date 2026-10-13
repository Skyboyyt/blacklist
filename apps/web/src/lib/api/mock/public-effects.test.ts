import { addressResearchSchema, type V1RiskFactorCode } from '@blacklist/contracts';
import { describe, expect, it } from 'vitest';
import type { MemberResult, ModerationResult } from '../types';
import { EVM } from './fixtures/ids';
import { createMockMemberApi } from './member-api';
import { createMockModerationApi, stepUpActionFor } from './moderation-api';
import { createMockResearchApi } from './research-api';
import { bandForScore, PROPOSED_CONTRIBUTIONS } from './staff-scoring';
import { createStore } from './store';

function ok<T>(result: MemberResult<T> | ModerationResult<T>): T {
  if (result.kind !== 'ok') throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  return result.data;
}

describe('public effects of staff decisions (mock store)', () => {
  it('an approved revision publishes the finding; the band follows the documented contributions', async () => {
    let cookies = 'bl_mock_viewer=member; bl_mock_passkey=verified';
    const store = createStore();
    const options = { cookies: () => cookies, latencyMs: 0, store };
    const member = createMockMemberApi(options);
    const staff = createMockModerationApi(options);
    const { id } = ok(
      await member.submitReport({
        category: 'phishing',
        title: 'Fake airdrop claim page',
        subjects: [{ chain: 'ethereum', address: EVM.low }],
        narrative: 'A fake airdrop page asked me to approve a token spender.',
        incidentDate: '2026-09-01',
        txRefs: [],
        urls: [],
        evidence: [],
      }),
    );
    const research = () => createMockResearchApi({ latencyMs: 0, store });
    const before = await research().getAddressResearch('ethereum', EVM.low);
    expect(before.kind === 'found' && before.data.findings).toHaveLength(0);

    cookies = 'bl_mock_viewer=moderator; bl_mock_passkey=verified';
    ok(await staff.decide(id, ok(await staff.getCase(id)).version, { action: 'start_review' }));
    const decision = {
      action: 'accept_report',
      severity: 'high',
      publicSummary: 'This address collected approvals through a fake airdrop page.',
      internalRationale: 'INTERNAL-ONLY the reporter evidence matched.',
    } as const;
    await staff.verifyStepUp(stepUpActionFor('accept_report'), id, [
      id,
      ok(await staff.getCase(id)).version,
      decision,
    ]);
    ok(
      await staff.decide(id, ok(await staff.getCase(id)).version, {
        action: 'accept_report',
        severity: 'high',
        publicSummary: 'This address collected approvals through a fake airdrop page.',
        internalRationale: 'INTERNAL-ONLY the reporter evidence matched.',
      }),
    );
    const pending = await research().getAddressResearch('ethereum', EVM.low);
    expect(pending.kind === 'found' && pending.data.findings).toHaveLength(0);

    const revision = ok(await staff.listRevisions()).find((r) => r.sourceCaseId === id);
    if (!revision) throw new Error('no revision');
    await staff.verifyStepUp('finding.approve', revision.findingId, [
      revision.findingId,
      revision.revisionNumber,
      revision.contentHash,
    ]);
    ok(await staff.approveRevision(revision.findingId, revision.revisionNumber, revision.contentHash));

    cookies = 'bl_mock_viewer=anonymous';
    const after = await research().getAddressResearch('ethereum', EVM.low);
    if (after.kind !== 'found') throw new Error('address missing');
    expect(addressResearchSchema.safeParse(after.data).success).toBe(true);
    expect(after.data.findings.map((f) => f.id)).toContain(revision.findingId);
    const score = Math.min(
      74,
      after.data.assessment.factors.reduce(
        (sum, f) => sum + PROPOSED_CONTRIBUTIONS[f.code as V1RiskFactorCode],
        0,
      ),
    );
    expect(after.data.assessment.band).toBe(bandForScore(score));
    expect(after.data.assessment.band).toBe('high');
    expect(JSON.stringify(after.data)).not.toContain('INTERNAL-ONLY');
    expect(JSON.stringify(after.data)).not.toMatch(/"score"/);
  });
});
