/**
 * Staff permission catalog for the frontend (mirrors ARCHITECTURE §9.2; the real catalog
 * lives server-side in `domain/access`). The UI uses it to choose what to show, and the
 * mock service uses it to REFUSE disallowed calls, so permissions are never modelled by
 * hidden buttons alone. Neither is production authorization: the API decides (Phase 7+).
 */
import type { StaffRole, Viewer } from '@blacklist/contracts';

export type StaffPermission =
  | 'moderation:queue:read'
  | 'moderation:case:read'
  | 'moderation:case:assign'
  | 'report:read:any'
  | 'finding:propose'
  | 'finding:publish'
  | 'finding:approve_severe'
  | 'appeal:decide'
  | 'correction:decide'
  | 'evidence:read_derivative'
  | 'project:manage'
  | 'audit:read';

const MODERATOR: readonly StaffPermission[] = [
  'moderation:queue:read',
  'moderation:case:read',
  'moderation:case:assign',
  'report:read:any',
  'finding:propose',
  'finding:publish',
  'finding:approve_severe',
  'appeal:decide',
  'correction:decide',
  'evidence:read_derivative',
];

export const ROLE_PERMISSIONS: Readonly<Record<StaffRole, readonly StaffPermission[]>> = {
  moderator: MODERATOR,
  /** Appeal cases only (`moderation:case:read` is scoped to appeals for this role). */
  appeal_reviewer: [
    'moderation:queue:read',
    'moderation:case:read',
    'appeal:decide',
    'evidence:read_derivative',
  ],
  admin: [...MODERATOR, 'project:manage', 'audit:read'],
};

export function hasPermission(role: StaffRole | null, permission: StaffPermission): boolean {
  return role !== null && ROLE_PERMISSIONS[role].includes(permission);
}

export const ROLE_LABEL: Readonly<Record<StaffRole, string>> = {
  moderator: 'Moderator',
  appeal_reviewer: 'Appeal reviewer',
  admin: 'Administrator',
};

/** The viewer's staff role, or null for members and anonymous viewers. Layout only. */
export function staffRoleOf(viewer: Viewer): StaffRole | null {
  return viewer.kind === 'signed_in' && viewer.role !== 'member' ? viewer.role : null;
}
