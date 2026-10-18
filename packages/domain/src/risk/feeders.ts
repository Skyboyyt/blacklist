import { schema, eq, and, inArray, sql, type Database } from '@blacklist/db';
import type { AccountInfo, ReadOptions } from '@blacklist/chains';
import type { Actor } from '../access/index.ts';
import { readResearchAddress, readResearchToken, type ResearchContext } from '../research/service.ts';
import { addressSubject, normalizeAddress } from '../moderation/subjects.ts';
import type { SignalStatus } from './engine.ts';
import { impersonatedSymbol, isCanonicalToken } from './canonical-tokens.ts';
import { recomputeSubject } from './service.ts';

// Automatic analysis signals (ADR 0021; ARCHITECTURE §15.2–§15.3). A signal is created only
// from a fact two independent providers agreed on at the same block (chain-data §5.5); a
// single-source, inconclusive or conflicting read creates nothing and retracts nothing.
// Each change appends a signal revision and recomputes the subject in one transaction, and
// a repeated view with the same facts writes nothing.

const DELEGATION = 'eoa.delegated_to_flagged';
const IMPERSONATION = 'token.symbol_impersonation';
const VERIFIED = { minFinality: 'final', crossVerify: true } as const;
type Signal = typeof schema.riskSignals.$inferSelect;
const LIVE: readonly SignalStatus[] = ['active', 'suppressed'];

/** Published high or severe findings on an Ethereum address: what makes a delegate "flagged". */
async function flaggingFindings(db: Database, address: string) {
  const rows = await db
    .select({ id: schema.findings.id })
    .from(schema.findings)
    .innerJoin(schema.addresses, eq(schema.addresses.subjectId, schema.findings.subjectId))
    .innerJoin(schema.chains, eq(schema.chains.chainId, schema.addresses.chainId))
    .innerJoin(schema.findingRevisions, eq(schema.findingRevisions.id, schema.findings.publishedRevisionId))
    .where(
      and(
        eq(schema.chains.slug, 'ethereum'),
        eq(schema.addresses.address, normalizeAddress('ethereum', address)),
        eq(schema.findings.status, 'published'),
        inArray(schema.findingRevisions.severity, ['high', 'severe']),
      ),
    );
  return rows.map((r) => r.id).sort();
}

async function liveSignals(db: Database, factorCode: string, sourceRefPattern: string) {
  return db
    .select()
    .from(schema.riskSignals)
    .where(
      and(
        eq(schema.riskSignals.sourceType, 'chain_analysis'),
        eq(schema.riskSignals.factorCode, factorCode),
        sql`${schema.riskSignals.sourceRef} like ${sourceRefPattern}`,
        inArray(schema.riskSignals.status, [...LIVE]),
      ),
    );
}

async function suppressed(tx: Database, subjectId: string, factorCode: string) {
  const rows = await tx
    .select({ id: schema.riskSignalSuppressions.id, liftedAt: schema.riskSignalSuppressions.liftedAt })
    .from(schema.riskSignalSuppressions)
    .where(
      and(
        eq(schema.riskSignalSuppressions.subjectId, subjectId),
        eq(schema.riskSignalSuppressions.factorCode, factorCode),
      ),
    );
  return rows.some((r) => r.liftedAt === null);
}

/**
 * Appends a revision unless the signal already says the same thing. A null `sourceRevision`
 * keeps the confirmed read the signal already rests on (an evidence refresh).
 */
async function writeRevision(
  tx: Database,
  signal: Signal,
  status: SignalStatus,
  sourceRevision: string | null,
  evidenceRefs: readonly string[],
  reason: string,
) {
  const [last] = await tx
    .select()
    .from(schema.riskSignalRevisions)
    .where(
      and(
        eq(schema.riskSignalRevisions.signalId, signal.id),
        eq(schema.riskSignalRevisions.revision, signal.currentRevision),
      ),
    );
  if (
    last &&
    last.status === status &&
    JSON.stringify(last.evidenceRefs) === JSON.stringify(evidenceRefs) &&
    (sourceRevision === null || last.sourceRevision === sourceRevision)
  )
    return false;
  const revision = signal.currentRevision + 1;
  await tx.insert(schema.riskSignalRevisions).values({
    signalId: signal.id,
    revision,
    status,
    sourceRevision: sourceRevision ?? last?.sourceRevision ?? 'unknown',
    independentlyApproved: false,
    evidenceRefs: [...evidenceRefs],
    reason,
  });
  await tx
    .update(schema.riskSignals)
    .set({ currentRevision: revision, status })
    .where(eq(schema.riskSignals.id, signal.id));
  return true;
}

/** Creates or re-activates a signal (suppressed while an admin suppression is active), then recomputes. */
async function assertSignal(
  ctx: ResearchContext,
  address: string,
  factorCode: string,
  sourceRef: string,
  sourceRevision: string | null,
  evidenceRefs: readonly string[],
  reason: string,
) {
  await ctx.runtime.transaction(async (tx) => {
    const { subjectId } = await addressSubject(tx, 'ethereum', address);
    await tx
      .insert(schema.riskSignals)
      .values({
        subjectId,
        factorCode,
        tier: 'analysis',
        provenance: 'platform_analysis',
        sourceType: 'chain_analysis',
        sourceRef,
        currentRevision: 0,
        status: 'active',
      })
      .onConflictDoNothing();
    const [signal] = await tx
      .select()
      .from(schema.riskSignals)
      .where(
        and(
          eq(schema.riskSignals.sourceType, 'chain_analysis'),
          eq(schema.riskSignals.sourceRef, sourceRef),
          eq(schema.riskSignals.factorCode, factorCode),
        ),
      )
      .for('update');
    if (!signal) throw new Error('signal_creation_failed');
    const status = (await suppressed(tx, subjectId, factorCode)) ? 'suppressed' : 'active';
    if (await writeRevision(tx, signal, status, sourceRevision, evidenceRefs, reason))
      await recomputeSubject(tx, subjectId, 'signal_change');
  });
}

/** Retracts live signals and recomputes their subjects, inside the caller's transaction. */
async function retractIn(tx: Database, signals: readonly Signal[], reason: string) {
  const subjects = new Set<string>();
  for (const s of signals) {
    const [signal] = await tx
      .select()
      .from(schema.riskSignals)
      .where(eq(schema.riskSignals.id, s.id))
      .for('update');
    if (!signal || !LIVE.includes(signal.status as SignalStatus)) continue;
    if (await writeRevision(tx, signal, 'retracted', null, [], reason)) subjects.add(signal.subjectId);
  }
  for (const subjectId of subjects) await recomputeSubject(tx, subjectId, 'signal_change');
}
async function retract(ctx: ResearchContext, signals: readonly Signal[], reason: string) {
  if (signals.length) await ctx.runtime.transaction((tx) => retractIn(tx, signals, reason));
}

const blockOf = (snapshot: { kind: string; blockHash?: string }) =>
  snapshot.kind === 'evm_block' && snapshot.blockHash ? snapshot.blockHash : 'unknown';
const delegationRef = (wallet: string, delegate: string) => `eip7702:${wallet}:${delegate}`;
const delegateOf = (signal: Signal) => signal.sourceRef.split(':')[2] ?? '';

/** `eoa.delegated_to_flagged`: the wallet's EIP-7702 delegate has a published high/severe finding. */
async function feedDelegation(
  ctx: ResearchContext,
  actor: Actor | null,
  wallet: string,
  account: AccountInfo,
) {
  const db = ctx.runtime.db;
  const live = await liveSignals(db, DELEGATION, `eip7702:${wallet}:%`);
  // A delegate that lost its flagging finding no longer counts. That is a database fact, so
  // no chain read is needed to retract.
  const stale: Signal[] = [],
    remaining: Signal[] = [];
  for (const s of live) ((await flaggingFindings(db, delegateOf(s))).length ? remaining : stale).push(s);
  await retract(ctx, stale, 'the delegate no longer has a published high or severe finding');

  const delegate = account.delegateAddress ? normalizeAddress('ethereum', account.delegateAddress) : null;
  const findings = delegate ? await flaggingFindings(db, delegate) : [];
  const current = delegate
    ? remaining.find((s) => s.sourceRef === delegationRef(wallet, delegate))
    : undefined;
  const others = remaining.filter((s) => s !== current);
  if (current && !others.length) {
    // Already confirmed for this delegate: only refresh the finding references.
    await assertSignal(
      ctx,
      wallet,
      DELEGATION,
      current.sourceRef,
      null,
      findings,
      'delegate findings updated',
    );
    return;
  }
  if (!others.length && !findings.length) return;
  // Creating a signal, or retracting one because the delegation seems to have changed,
  // both need a read that two independent providers agree on.
  const read = await readResearchAddress(ctx, actor, 'ethereum', wallet, VERIFIED);
  if (!read.result.ok || read.result.value.provenance.verification !== 'agree' || !read.result.value.data)
    return;
  const confirmed = read.result.value.data.delegateAddress
    ? normalizeAddress('ethereum', read.result.value.data.delegateAddress)
    : null;
  await retract(
    ctx,
    remaining.filter((s) => !confirmed || s.sourceRef !== delegationRef(wallet, confirmed)),
    'a confirmed read shows the delegation changed or was removed',
  );
  const confirmedFindings = confirmed ? await flaggingFindings(db, confirmed) : [];
  if (confirmed && confirmedFindings.length)
    await assertSignal(
      ctx,
      wallet,
      DELEGATION,
      delegationRef(wallet, confirmed),
      `verified@${blockOf(read.result.value.provenance.snapshot)}`,
      confirmedFindings,
      'two independent providers confirmed the delegation',
    );
}

/** `token.symbol_impersonation`: an ERC-20 using a well-known token's symbol at another address. */
async function feedImpersonation(
  ctx: ResearchContext,
  actor: Actor | null,
  token: string,
  options: ReadOptions,
) {
  const ref = `symbol:${token}`;
  const [live] = await liveSignals(ctx.runtime.db, IMPERSONATION, ref);
  // The reviewed list now names this address as canonical: a code fact, no read needed.
  if (live && isCanonicalToken(token)) {
    await retract(ctx, [live], 'the address is on the reviewed list of canonical tokens');
    return;
  }
  if (live) return;
  // The page's own read options, so the token details page reuses this cached read.
  const single = await readResearchToken(ctx, actor, 'ethereum', token, options);
  if (!single.result.ok || !impersonatedSymbol(token, single.result.value.data?.symbolOnchain ?? null))
    return;
  const read = await readResearchToken(ctx, actor, 'ethereum', token, VERIFIED);
  if (!read.result.ok || read.result.value.provenance.verification !== 'agree') return;
  const symbol = impersonatedSymbol(token, read.result.value.data?.symbolOnchain ?? null);
  if (symbol)
    await assertSignal(
      ctx,
      token,
      IMPERSONATION,
      ref,
      `verified@${blockOf(read.result.value.provenance.snapshot)}:${symbol}`,
      [],
      'two independent providers confirmed the token symbol',
    );
}

/**
 * Feeds the automatic analysis factors for a researched Ethereum address (ADR 0021). Provider
 * failures leave everything as it was; the research page never depends on this succeeding.
 */
export async function feedChainAnalysis(
  ctx: ResearchContext,
  actor: Actor | null,
  chain: string,
  account: AccountInfo,
  options: ReadOptions = {},
) {
  if (chain !== 'ethereum') return;
  const address = normalizeAddress('ethereum', account.address);
  if (account.kind === 'eoa' || account.kind === 'eoa_delegated')
    await feedDelegation(ctx, actor, address, account);
  else if (account.kind === 'contract') await feedImpersonation(ctx, actor, address, options);
}

/**
 * Called when a finding's public state changes on an Ethereum address: wallets delegating to
 * it lose their signal once it no longer has a published high or severe finding. A newly
 * flagged delegate is picked up on the wallet's next view, after a confirmed chain read.
 */
export async function onDelegateFindingChanged(tx: Database, chain: string, address: string) {
  if (chain !== 'ethereum') return;
  const delegate = normalizeAddress('ethereum', address);
  if ((await flaggingFindings(tx, delegate)).length) return;
  const dependants = await liveSignals(tx, DELEGATION, `eip7702:%:${delegate}`);
  await retractIn(tx, dependants, 'the delegate no longer has a published high or severe finding');
}
