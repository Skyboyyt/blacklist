import { schema, eq, and, desc, isNull, type Database } from '@blacklist/db';
import type { UserActor } from '../access/types.ts';
import { requirePermission } from '../access/policies.ts';
import { appendAudit } from '../audit/service.ts';
import { refuse } from '../shared/errors.ts';
import type { IdentityContext } from '../identity/types.ts';
import { withStepup, type AssertionInput } from '../staff/webauthn.ts';
import { normalizeAddress, type ChainSlug } from '../moderation/subjects.ts';
import { staffRefs } from '../moderation/refs.ts';
import { recomputeSubject, setAnalysisSignalStatus } from './service.ts';

// Signal suppressions (PRD §5.14; contracts admin.ts `suppressionSchema`). An administrator
// stops an analysis factor contributing on one address, with a public reason and a step-up.
// The signal gets a `suppressed` revision and the subject is recomputed in the same
// transaction; lifting does the reverse. Findings are suspended or reversed, never suppressed.

const TARGET = 'risk_signal_suppression';
export type SuppressibleFactor = 'token.symbol_impersonation' | 'eoa.delegated_to_flagged';
type Suppression = typeof schema.riskSignalSuppressions.$inferSelect;

export interface SuppressionInput {
  chain: ChainSlug;
  address: string;
  factorCode: SuppressibleFactor;
  publicReason: string;
  internalRationale: string;
}

async function allSuppressions(tx: Database) {
  const rows = await tx
    .select({ s: schema.riskSignalSuppressions, address: schema.addresses.address, slug: schema.chains.slug })
    .from(schema.riskSignalSuppressions)
    .innerJoin(schema.addresses, eq(schema.addresses.subjectId, schema.riskSignalSuppressions.subjectId))
    .innerJoin(schema.chains, eq(schema.chains.chainId, schema.addresses.chainId))
    .orderBy(desc(schema.riskSignalSuppressions.createdAt))
    .limit(500);
  const refs = await staffRefs(
    tx,
    rows.flatMap(({ s }) => [s.createdByRef, ...(s.liftedByRef ? [s.liftedByRef] : [])]),
  );
  const ref = (id: string) => refs.get(id) ?? { id, handle: 'Staff' };
  return rows.map(({ s, address, slug }) => ({
    id: s.id,
    subject: { chain: slug as ChainSlug, address, displayAddress: address },
    factorCode: s.factorCode as SuppressibleFactor,
    publicReason: s.publicReason,
    internalRationale: s.internalRationale,
    createdBy: ref(s.createdByRef),
    createdAt: s.createdAt.toISOString(),
    liftedAt: s.liftedAt?.toISOString() ?? null,
    liftedBy: s.liftedByRef ? ref(s.liftedByRef) : null,
  }));
}

export async function listSuppressions(ctx: IdentityContext, actor: UserActor) {
  requirePermission(actor, 'signal:suppress');
  return allSuppressions(ctx.runtime.db);
}

export async function suppressSignal(
  ctx: IdentityContext,
  actor: UserActor,
  input: SuppressionInput,
  assertion: AssertionInput,
) {
  requirePermission(actor, 'signal:suppress');
  return withStepup(
    ctx,
    actor,
    { action: 'signal.suppress', targetType: 'suppression', targetId: 'new', parameters: input },
    assertion,
    async (tx) => {
      const [subject] = await tx
        .select({ subjectId: schema.addresses.subjectId })
        .from(schema.addresses)
        .innerJoin(schema.chains, eq(schema.chains.chainId, schema.addresses.chainId))
        .where(
          and(
            eq(schema.chains.slug, input.chain),
            eq(schema.addresses.address, normalizeAddress(input.chain, input.address)),
          ),
        );
      if (!subject)
        throw refuse(
          'invalid_transition',
          'Blacklist has no record of this address on the selected network.',
        );
      const [created] = await tx
        .insert(schema.riskSignalSuppressions)
        .values({
          subjectId: subject.subjectId,
          factorCode: input.factorCode,
          publicReason: input.publicReason,
          internalRationale: input.internalRationale,
          stepupChallengeId: assertion.challengeId,
          createdByRef: actor.actorRef,
        })
        .onConflictDoNothing()
        .returning();
      if (!created) throw refuse('conflict', 'This indicator is already suppressed on this address.');
      const changed = await setAnalysisSignalStatus(
        tx,
        subject.subjectId,
        input.factorCode,
        'active',
        'suppressed',
        `suppression:${created.id}`,
        'suppressed by an administrator',
      );
      if (!changed)
        throw refuse(
          'invalid_transition',
          'This address has no active indicator with that code to suppress.',
        );
      await appendAudit(tx, actor, 'signal.suppressed', TARGET, created.id, { factorCode: input.factorCode });
      await recomputeSubject(tx, subject.subjectId, 'signal_change');
      return allSuppressions(tx);
    },
  );
}

export async function liftSuppression(
  ctx: IdentityContext,
  actor: UserActor,
  id: string,
  reason: string,
  assertion: AssertionInput,
) {
  requirePermission(actor, 'signal:suppress');
  return withStepup(
    ctx,
    actor,
    { action: 'signal.suppression.lift', targetType: 'suppression', targetId: id, parameters: { reason } },
    assertion,
    async (tx) => {
      const [lifted] = await tx
        .update(schema.riskSignalSuppressions)
        .set({
          liftedAt: new Date(),
          liftedByRef: actor.actorRef,
          liftReason: reason,
          liftStepupChallengeId: assertion.challengeId,
        })
        .where(and(eq(schema.riskSignalSuppressions.id, id), isNull(schema.riskSignalSuppressions.liftedAt)))
        .returning();
      if (!lifted) {
        const [exists] = await tx
          .select()
          .from(schema.riskSignalSuppressions)
          .where(eq(schema.riskSignalSuppressions.id, id));
        throw exists
          ? refuse('invalid_transition', 'This suppression was already lifted.')
          : refuse('not_found', 'No such suppression.');
      }
      await setAnalysisSignalStatus(
        tx,
        lifted.subjectId,
        lifted.factorCode,
        'suppressed',
        'active',
        `lifted:${lifted.id}`,
        'suppression lifted by an administrator',
      );
      await appendAudit(tx, actor, 'signal.suppression_lifted', TARGET, id, {
        factorCode: lifted.factorCode,
      });
      await recomputeSubject(tx, lifted.subjectId, 'signal_change');
      return allSuppressions(tx);
    },
  );
}

/** Public view: active suppressions with their reason, and history events for the timeline. */
export async function publicSuppressions(db: Database, subjectId: string | null) {
  if (!subjectId) return { active: [], timeline: [] };
  const rows: Suppression[] = await db
    .select()
    .from(schema.riskSignalSuppressions)
    .where(eq(schema.riskSignalSuppressions.subjectId, subjectId))
    .orderBy(desc(schema.riskSignalSuppressions.createdAt));
  return {
    active: rows
      .filter((s) => !s.liftedAt)
      .map((s) => ({
        factorCode: s.factorCode as SuppressibleFactor,
        publicReason: s.publicReason,
        at: s.createdAt.toISOString(),
      })),
    timeline: rows.flatMap((s) => [
      {
        id: `suppressed-${s.id}`,
        kind: 'signal_suppressed' as const,
        label: `An administrator suppressed an analysis indicator: ${s.publicReason}`,
        at: s.createdAt.toISOString(),
        actor: 'moderator' as const,
      },
      ...(s.liftedAt
        ? [
            {
              id: `lifted-${s.id}`,
              kind: 'suppression_lifted' as const,
              label: 'The suppression was lifted; the indicator counts again.',
              at: s.liftedAt.toISOString(),
              actor: 'moderator' as const,
            },
          ]
        : []),
    ]),
  };
}
