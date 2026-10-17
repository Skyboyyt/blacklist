import { schema, eq, and, desc, isNull, type Database } from '@blacklist/db';
import type { UserActor } from '../access/types.ts';
import { requirePermission } from '../access/policies.ts';
import { appendAudit } from '../audit/service.ts';
import { refuse } from '../shared/errors.ts';
import type { IdentityContext } from '../identity/types.ts';
import { lockActor } from '../identity/sessions.ts';
import { addressSubject, type ChainSlug } from './subjects.ts';
import { staffRefs } from './refs.ts';

// Public identification labels (data-model §4; contracts admin.ts `adminLabelSchema`). A
// label names an address; it is never a risk factor and changes no assessment. Labels are
// retired, never edited or deleted (0010 guards).

const TARGET = 'address_label';
type Label = typeof schema.addressLabels.$inferSelect;

export interface LabelInput {
  chain: ChainSlug;
  address: string;
  text: string;
  provenance: 'moderator_finding' | 'external_source';
  sourceName?: string | undefined;
  basisNote: string;
}

async function views(tx: Database, rows: readonly { l: Label; address: string; slug: string }[]) {
  const refs = await staffRefs(
    tx,
    rows.map((r) => r.l.createdByRef),
  );
  return rows.map(({ l, address, slug }) => ({
    id: l.id,
    subject: { chain: slug as ChainSlug, address, displayAddress: address },
    text: l.text,
    provenance: l.provenance as LabelInput['provenance'],
    sourceName: l.sourceName,
    basisNote: l.basisNote,
    status: l.retiredAt ? ('retired' as const) : ('active' as const),
    createdBy: refs.get(l.createdByRef) ?? { id: l.createdByRef, handle: 'Staff' },
    createdAt: l.createdAt.toISOString(),
    retiredAt: l.retiredAt?.toISOString() ?? null,
  }));
}

async function allLabels(tx: Database) {
  const rows = await tx
    .select({ l: schema.addressLabels, address: schema.addresses.address, slug: schema.chains.slug })
    .from(schema.addressLabels)
    .innerJoin(schema.addresses, eq(schema.addresses.subjectId, schema.addressLabels.subjectId))
    .innerJoin(schema.chains, eq(schema.chains.chainId, schema.addresses.chainId))
    .orderBy(desc(schema.addressLabels.createdAt))
    .limit(500);
  return views(tx, rows);
}

export async function listLabels(ctx: IdentityContext, actor: UserActor) {
  requirePermission(actor, 'label:manage');
  return allLabels(ctx.runtime.db);
}

export async function addLabel(ctx: IdentityContext, actor: UserActor, input: LabelInput) {
  requirePermission(actor, 'label:manage');
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    const { subjectId } = await addressSubject(tx, input.chain, input.address);
    const [created] = await tx
      .insert(schema.addressLabels)
      .values({
        subjectId,
        text: input.text,
        provenance: input.provenance,
        sourceName: input.provenance === 'external_source' ? (input.sourceName ?? null) : null,
        basisNote: input.basisNote,
        createdByRef: actor.actorRef,
      })
      .onConflictDoNothing()
      .returning();
    if (!created) throw refuse('conflict', 'This address already has an active label with that text.');
    await appendAudit(tx, actor, 'label.added', TARGET, created.id);
    return allLabels(tx);
  });
}

export async function retireLabel(ctx: IdentityContext, actor: UserActor, id: string, reason: string) {
  requirePermission(actor, 'label:manage');
  return ctx.runtime.transaction(async (tx) => {
    await lockActor(tx, actor);
    const [retired] = await tx
      .update(schema.addressLabels)
      .set({ retiredAt: new Date(), retiredByRef: actor.actorRef, retireReason: reason })
      .where(and(eq(schema.addressLabels.id, id), isNull(schema.addressLabels.retiredAt)))
      .returning();
    if (!retired) {
      const [exists] = await tx.select().from(schema.addressLabels).where(eq(schema.addressLabels.id, id));
      throw exists
        ? refuse('invalid_transition', 'This label is already retired.')
        : refuse('not_found', 'No such label.');
    }
    await appendAudit(tx, actor, 'label.retired', TARGET, id);
    return allLabels(tx);
  });
}

/** Active labels for a public research page (contracts `publicLabelSchema`). */
export async function publicLabels(db: Database, subjectId: string | null) {
  if (!subjectId) return [];
  const rows = await db
    .select()
    .from(schema.addressLabels)
    .where(and(eq(schema.addressLabels.subjectId, subjectId), isNull(schema.addressLabels.retiredAt)))
    .orderBy(desc(schema.addressLabels.createdAt));
  return rows.map((l) => ({
    id: l.id,
    text: l.text,
    provenance: l.provenance as LabelInput['provenance'],
    sourceName: l.sourceName,
    addedAt: l.createdAt.toISOString(),
  }));
}
