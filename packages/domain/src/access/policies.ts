import { DomainError } from '../shared/errors.ts';
import type { UserActor } from './types.ts';
// Only Phase 7 permissions are executable. Later-phase services must extend this
// catalog with their scope/conflict rules before registering routes.
const staff = ['staff:recovery:verify'] as const;
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
export type Permission =
  (typeof staff)[number] | (typeof admin)[number] | 'session:manage:own' | 'profile:update:own';
const catalog = new Set<string>([...staff, ...admin, 'session:manage:own', 'profile:update:own']);
export const isPermission = (value: unknown): value is Permission =>
  typeof value === 'string' && catalog.has(value);
export function hasPermission(actor: UserActor, permission: Permission): boolean {
  if (!isPermission(permission)) return false;
  if (permission === 'session:manage:own' || permission === 'profile:update:own')
    return actor.accountKind === 'member' || actor.staffAssured;
  if (actor.accountKind !== 'staff' || !actor.staffAssured || !actor.staffPermissionsActive) return false;
  return actor.roles.some(
    (role) => role === 'admin' || (role === 'moderator' && (staff as readonly string[]).includes(permission)),
  );
}
export function requirePermission(actor: UserActor, permission: Permission) {
  if (!hasPermission(actor, permission)) throw new DomainError('forbidden');
}
export function requireOwner(actor: UserActor, userId: string) {
  if (actor.userId !== userId) throw new DomainError('not_found');
}
