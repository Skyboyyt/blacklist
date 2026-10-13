import type { MockStore } from './store';

/** Retain every past participant, not only the latest published author/approver pair. */
export function participantIds(store: MockStore, findingId: string): Set<string> {
  const current = store.findingParticipants.get(findingId);
  return new Set([
    ...(store.findingParticipantHistory.get(findingId) ?? []),
    ...store.revisions.filter((r) => r.findingId === findingId).map((r) => r.author.id),
    ...(current ? [current.author.id, current.approver.id] : []),
  ]);
}
