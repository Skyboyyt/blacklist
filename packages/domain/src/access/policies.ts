import { DomainError } from '../shared/errors.ts';
import type { UserActor, StaffRole } from './types.ts';
// Permission catalog (ARCHITECTURE §9.2). Scope and conflict rules (own records, appeal
// cases only, independence) are enforced again by each domain service.
const member = [
  'report:create',
  'report:read:own',
  'standing:prove',
  'response:create',
  'appeal:create',
  'correction:create',
  'notification:read:own',
] as const;
const moderator = [
  'moderation:queue:read',
  'moderation:case:read',
  'moderation:case:assign',
  'report:read:any',
  'finding:propose',
  'finding:publish',
  'finding:approve_severe',
  'finding:suspend',
  'standing:decide',
  'appeal:decide',
  'response:moderate',
  'correction:decide',
  'evidence:read_derivative',
  'staff:recovery:verify',
] as const;
// The queue is readable so reviewers see appeal cases; the domain limits it to appeals.
const appealReviewer = [
  'moderation:queue:read',
  'moderation:case:read',
  'appeal:decide',
  'evidence:read_derivative',
] as const;
const admin = [
  'staff:invite',
  'staff:role:request',
  'staff:role:approve',
  'staff:suspend',
  'staff:offboard',
  'staff:recovery:open',
  'staff:recovery:approve',
  'staff:recovery:complete',
  'audit:read',
  'user:suspend',
] as const;
const own = ['session:manage:own', 'profile:update:own'] as const;
export type Permission =
  | (typeof member)[number]
  | (typeof moderator)[number]
  | (typeof appealReviewer)[number]
  | (typeof admin)[number]
  | (typeof own)[number];
const catalog = new Set<string>([...member, ...moderator, ...appealReviewer, ...admin, ...own]);
const byRole: Record<StaffRole, ReadonlySet<string>> = {
  moderator: new Set(moderator),
  appeal_reviewer: new Set(appealReviewer),
  admin: new Set([...moderator, ...admin]),
};
const memberSet = new Set<string>(member);
export const isPermission = (value: unknown): value is Permission =>
  typeof value === 'string' && catalog.has(value);
export function hasPermission(actor: UserActor, permission: Permission): boolean {
  if (!isPermission(permission)) return false;
  if ((own as readonly string[]).includes(permission))
    return actor.accountKind === 'member' || actor.staffAssured;
  // Staff use dedicated accounts; member permissions belong to member accounts only.
  if (memberSet.has(permission)) return actor.accountKind === 'member';
  if (actor.accountKind !== 'staff' || !actor.staffAssured || !actor.staffPermissionsActive) return false;
  return actor.roles.some((role) => byRole[role].has(permission));
}
export function requirePermission(actor: UserActor, permission: Permission) {
  if (!hasPermission(actor, permission)) throw new DomainError('forbidden');
}
export function requireOwner(actor: UserActor, userId: string) {
  if (actor.userId !== userId) throw new DomainError('not_found');
}
