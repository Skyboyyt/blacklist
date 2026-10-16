import { schema, inArray, type Database } from '@blacklist/db';
import { digest } from '../shared/crypto.ts';

export interface StaffRefView {
  id: string;
  handle: string;
}

/** Resolves staff actor references to handles. Unknown or erased references show as "Staff". */
export async function staffRefs(tx: Database, refs: readonly string[]) {
  const unique = [...new Set(refs)];
  const out = new Map<string, StaffRefView>();
  if (!unique.length) return out;
  const maps = await tx.select().from(schema.actorMap).where(inArray(schema.actorMap.actorRef, unique));
  const userIds = maps.map((m) => m.userId).filter((id): id is string => id !== null);
  const profiles = userIds.length
    ? await tx.select().from(schema.profiles).where(inArray(schema.profiles.userId, userIds))
    : [];
  for (const ref of unique) {
    const userId = maps.find((m) => m.actorRef === ref)?.userId;
    out.set(ref, { id: ref, handle: profiles.find((p) => p.userId === userId)?.handle ?? 'Staff' });
  }
  return out;
}

/** A per-case pseudonym for the submitter: stable within a case, unlinkable across cases. */
export function submitterPseudonym(caseId: string, userId: string, prefix = 'R') {
  return `${prefix}-${digest(`${caseId}:${userId}`).slice(0, 6).toUpperCase()}`;
}
