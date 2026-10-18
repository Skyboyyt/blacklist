import { randomBytes } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { z } from 'zod';
import { schema, eq } from '@blacklist/db';
import { createServer } from '@blacklist/api';
import { readApiConfig } from '@blacklist/config';
import { addressResearchSchema, researchResultSchema } from '@blacklist/contracts';
import {
  signIn,
  resolveSession,
  submitReport,
  decideCase,
  approveRevision,
  suspendFinding,
  getCase,
  type UserActor,
} from '@blacklist/domain';
import { createChainDataService, createEvmRpcSource } from '../../../packages/chains/src/index.ts';
import type { RpcTransport } from '../../../packages/chains/src/providers/rpc-transport.ts';
import {
  startApplicationFixture,
  fixtureUrl,
  syntheticPassword,
  type ApplicationFixture,
} from './application-fixture.ts';
import { addAssuredStaff } from './application-staff-fixture.ts';

// ADR 0021: automatic analysis signals exist only when two independent providers agree.
type Staff = Awaited<ReturnType<typeof addAssuredStaff>>;
const text = (s: string) => `${s} — fictional text long enough for validation.`;
const block = { number: '0x10', hash: '0x' + 'a'.repeat(64), timestamp: '0x65000000' };
const word = (n: bigint) => '0x' + n.toString(16).padStart(64, '0');
/** ABI encoding of a single `string` return value. */
function abiString(value: string) {
  const bytes = Buffer.from(value, 'utf8');
  const padded = Buffer.concat([bytes, Buffer.alloc((32 - (bytes.length % 32)) % 32)]);
  return '0x' + word(32n).slice(2) + word(BigInt(bytes.length)).slice(2) + padded.toString('hex');
}

interface Chain {
  code?: string;
  symbol?: string;
}
let f: ApplicationFixture;
beforeAll(async () => {
  f = await startApplicationFixture();
});
afterAll(async () => {
  if (f) await f.stop();
});

function provider(chain: Chain, calls: string[]): RpcTransport {
  return {
    async call<S extends z.ZodType>(
      method: string,
      params: readonly unknown[],
      validator: S,
    ): Promise<z.output<S>> {
      calls.push(method);
      let value: unknown;
      if (method === 'eth_chainId') value = '0x1';
      else if (method === 'eth_getBlockByNumber' || method === 'eth_getBlockByHash') value = block;
      else if (method === 'eth_getBalance') value = '0x2a';
      else if (method === 'eth_getCode') value = chain.code ?? '0x';
      else if (method === 'eth_getStorageAt') value = word(0n);
      else if (method === 'eth_call') {
        const data = (params[0] as { data: string }).data;
        value =
          data === '0x313ce567'
            ? word(6n)
            : data === '0x18160ddd'
              ? word(1000n)
              : data === '0x95d89b41'
                ? abiString(chain.symbol ?? 'TOKEN')
                : abiString('Fictional token');
      } else throw new Error('fixture_unexpected_method');
      return validator.parse(value);
    },
  };
}

/** The API with a primary and, optionally, a second provider in another independence group. */
function appFor(primary: Chain, secondary: Chain | null) {
  const calls = { primary: [] as string[], secondary: [] as string[] };
  const chains = createChainDataService([
    createEvmRpcSource(
      'fixture-a',
      secondary ? 'group-a' : 'unknown-upstream',
      provider(primary, calls.primary),
    ),
    ...(secondary ? [createEvmRpcSource('fixture-b', 'group-b', provider(secondary, calls.secondary))] : []),
  ]);
  const app = createServer(
    f.ctx,
    readApiConfig({
      NODE_ENV: 'test',
      DATABASE_URL: fixtureUrl(f.h, 'runtime'),
      APP_ORIGIN: f.ctx.settings.origin,
      BETTER_AUTH_SECRET: f.ctx.settings.secret,
      INTERNAL_API_TOKEN: randomBytes(32).toString('hex'),
      WEBAUTHN_RP_ID: f.ctx.settings.rpId,
      RISK_PUBLIC_BANDS: 'true',
    }),
    false,
    { runtime: f.ctx.runtime, chains },
  );
  const research = async (address: string) => {
    const result = researchResultSchema(addressResearchSchema).parse(
      (await app.inject({ method: 'GET', url: `/api/v1/addresses/ethereum/${address}` })).json(),
    );
    if (result.kind !== 'found') throw new Error('fixture_research_not_found');
    return result.data;
  };
  return { app, calls, research };
}

async function member() {
  const user = await f.addUser();
  const login = await signIn(f.ctx, user.email, syntheticPassword);
  const cookie = login.cookies.map((c) => c.split(';')[0]).join('; ');
  const actor = await resolveSession(f.ctx.runtime, f.ctx.auth, new Headers({ cookie }));
  if (!actor) throw new Error('fixture_member_session_missing');
  return actor as UserActor;
}
async function decide(who: Staff, id: string, decision: { action: string } & Record<string, unknown>) {
  const { version } = await getCase(f.ctx, who.actor, id);
  if (decision.action === 'start_review') return decideCase(f.ctx, who.actor, id, version, decision);
  return decideCase(
    f.ctx,
    who.actor,
    id,
    version,
    decision,
    await who.proof({
      action: `case.${decision.action}`,
      targetType: 'case',
      targetId: id,
      parameters: { version, decision },
    }),
  );
}
/** Publishes a finding of `severity` on `address`; returns its ID. */
async function publishedFinding(author: Staff, address: string, severity: string) {
  const { id } = await submitReport(
    f.ctx,
    await member(),
    {
      category: 'phishing',
      title: 'Fictional drainer report',
      subjects: [{ chain: 'ethereum', address }],
      narrative: text('Narrative'),
      incidentDate: '2026-10-01',
      txRefs: [{ chain: 'ethereum', hash: '0x' + '56'.repeat(32) }],
      urls: [],
      evidence: [],
    },
    'ip4:192.0.2.94',
  );
  await decide(author, id, { action: 'start_review' });
  await decide(author, id, {
    action: 'accept_report',
    severity,
    publicSummary: text('Public summary'),
    internalRationale: text('Rationale'),
  });
  const [c] = await f.ctx.runtime.db
    .select()
    .from(schema.moderationCases)
    .where(eq(schema.moderationCases.id, id));
  const [revision] = await f.ctx.runtime.db
    .select()
    .from(schema.findingRevisions)
    .where(eq(schema.findingRevisions.findingId, c?.findingId ?? ''));
  if (!c?.findingId || !revision) throw new Error('fixture_finding_missing');
  await approveRevision(
    f.ctx,
    author.actor,
    c.findingId,
    1,
    revision.contentHash,
    await author.proof({
      action: 'finding.approve',
      targetType: 'finding',
      targetId: c.findingId,
      parameters: { revisionNumber: 1, contentHash: revision.contentHash },
    }),
  );
  return c.findingId;
}
const signalsFor = (sourceRef: string) =>
  f.ctx.runtime.db.select().from(schema.riskSignals).where(eq(schema.riskSignals.sourceRef, sourceRef));
const revisionsOf = (signalId: string) =>
  f.ctx.runtime.db
    .select()
    .from(schema.riskSignalRevisions)
    .where(eq(schema.riskSignalRevisions.signalId, signalId));
const evm = (pair: string) => '0x' + pair.repeat(20);
const delegatedTo = (delegate: string) => '0xef0100' + delegate.slice(2);

describe('ADR 0021: automatic analysis scoring', () => {
  it('scores a wallet delegated to flagged code once two providers agree, and retracts when the finding is suspended', async () => {
    const author = await addAssuredStaff(f, 'moderator');
    const drainer = evm('d1'),
      wallet = evm('e1');
    const findingId = await publishedFinding(author, drainer, 'high');
    const chain = { code: delegatedTo(drainer) };
    const { app, research } = appFor(chain, chain);
    try {
      const scored = await research(wallet);
      expect(scored.assessment.band).toBe('moderate');
      expect(scored.assessment.factors.map((x) => [x.code, x.provenance])).toEqual([
        ['eoa.delegated_to_flagged', 'platform_analysis'],
      ]);
      expect(scored.assessment.factors[0]?.explanation).toContain('victim');
      expect('score' in scored.assessment).toBe(false);
      const [signal] = await signalsFor(`eip7702:${wallet}:${drainer}`);
      expect(signal).toMatchObject({ sourceType: 'chain_analysis', tier: 'analysis', status: 'active' });
      if (!signal) throw new Error('fixture_signal_missing');
      const [first] = await revisionsOf(signal.id);
      expect(first?.evidenceRefs).toEqual([findingId]);
      expect(first?.sourceRevision).toBe(`verified@${block.hash}`);

      // A repeat view with the same facts writes nothing.
      await research(wallet);
      expect(await revisionsOf(signal.id)).toHaveLength(1);

      // The delegate's finding is suspended: dependent wallets lose the signal immediately.
      const reason = text('Wrong subject');
      await suspendFinding(
        f.ctx,
        author.actor,
        findingId,
        reason,
        await author.proof({
          action: 'finding.suspend',
          targetType: 'finding',
          targetId: findingId,
          parameters: { reason },
        }),
      );
      const [after] = await signalsFor(`eip7702:${wallet}:${drainer}`);
      expect(after?.status).toBe('retracted');
      expect((await research(wallet)).assessment.band).toBe('not_assessed');
    } finally {
      await app.close();
    }
  });

  it('never scores from one provider, a conflicting second provider, or an unflagged delegate', async () => {
    const author = await addAssuredStaff(f, 'moderator');
    const drainer = evm('d2');
    await publishedFinding(author, drainer, 'high');
    const chain = { code: delegatedTo(drainer) };

    const single = appFor(chain, null);
    try {
      expect((await single.research(evm('e2'))).assessment.band).toBe('not_assessed');
      expect(await signalsFor(`eip7702:${evm('e2')}:${drainer}`)).toEqual([]);
    } finally {
      await single.app.close();
    }

    // The second provider reports different code at the same block: a conflict, never a signal.
    const conflicting = appFor(chain, { code: delegatedTo(evm('d9')) });
    try {
      await conflicting.research(evm('e3'));
      expect(await signalsFor(`eip7702:${evm('e3')}:${drainer}`)).toEqual([]);
    } finally {
      await conflicting.app.close();
    }

    // A delegate with no published finding: no signal and no confirming read at all.
    const unflagged = appFor({ code: delegatedTo(evm('d3')) }, { code: delegatedTo(evm('d3')) });
    try {
      expect((await unflagged.research(evm('e4'))).assessment.band).toBe('not_assessed');
      expect(unflagged.calls.secondary).toEqual([]);
    } finally {
      await unflagged.app.close();
    }
  });

  it('scores a confirmed lookalike of a well-known token symbol, but never the real token', async () => {
    const fake = evm('f1');
    const lookalike = appFor({ code: '0x6080', symbol: 'USDT' }, { code: '0x6080', symbol: 'USDT' });
    try {
      const scored = await lookalike.research(fake);
      expect(scored.assessment.band).toBe('moderate');
      expect(scored.assessment.factors.map((x) => x.code)).toEqual(['token.symbol_impersonation']);
      expect((await signalsFor(`symbol:${fake}`))[0]?.status).toBe('active');
      // Cyrillic "Т" in place of the Latin "T" is the same impersonation.
      const cyrillic = appFor({ code: '0x6080', symbol: 'USDТ' }, { code: '0x6080', symbol: 'USDТ' });
      try {
        expect((await cyrillic.research(evm('f2'))).assessment.band).toBe('moderate');
      } finally {
        await cyrillic.app.close();
      }
    } finally {
      await lookalike.app.close();
    }
    const real = '0xdac17f958d2ee523a2206206994597c13d831ec7';
    const canonical = appFor({ code: '0x6080', symbol: 'USDT' }, { code: '0x6080', symbol: 'USDT' });
    try {
      expect((await canonical.research(real)).assessment.band).toBe('not_assessed');
      expect(await signalsFor(`symbol:${real}`)).toEqual([]);
    } finally {
      await canonical.app.close();
    }
    // An unrelated symbol needs no confirming read.
    const unrelated = appFor({ code: '0x6080', symbol: 'FICTION' }, { code: '0x6080', symbol: 'FICTION' });
    try {
      await unrelated.research(evm('f3'));
      expect(unrelated.calls.secondary).toEqual([]);
      // The page's own token-details request reuses the check's cached read (provider budget).
      const before = unrelated.calls.primary.length;
      const token = await unrelated.app.inject({
        method: 'GET',
        url: `/api/v1/addresses/ethereum/${evm('f3')}/token`,
      });
      expect(token.json()).toMatchObject({ kind: 'found' });
      expect(unrelated.calls.primary.length).toBe(before);
    } finally {
      await unrelated.app.close();
    }
  });
});
