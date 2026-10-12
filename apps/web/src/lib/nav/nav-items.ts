/**
 * Navigation structure. The staff section is shown to staff viewers to keep the
 * layout uncluttered; it is NOT access control. Staff routes are protected by the
 * API (Phase 7), and staff pages render nothing sensitive without it.
 */
import type { Viewer } from '@blacklist/contracts';

export type NavIcon =
  'search' | 'projects' | 'dashboard' | 'reports' | 'appeals' | 'settings' | 'shield' | 'book';

export interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: NavIcon;
  /** Also active on nested routes with this prefix. */
  readonly matchPrefix?: string;
}

export interface NavSection {
  readonly id: 'primary' | 'account' | 'staff';
  readonly label: string;
  readonly items: readonly NavItem[];
}

export const PRIMARY_NAV: NavSection = {
  id: 'primary',
  label: 'Main',
  items: [
    { href: '/search', label: 'Research', icon: 'search', matchPrefix: '/search' },
    { href: '/projects', label: 'Projects', icon: 'projects', matchPrefix: '/project' },
    { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { href: '/reports', label: 'Reports', icon: 'reports', matchPrefix: '/reports' },
    { href: '/appeals/new', label: 'Appeals & responses', icon: 'appeals', matchPrefix: '/appeals' },
    { href: '/methodology', label: 'Methodology', icon: 'book' },
  ],
};

export const ACCOUNT_NAV: NavSection = {
  id: 'account',
  label: 'Account',
  items: [{ href: '/settings/profile', label: 'Settings', icon: 'settings', matchPrefix: '/settings' }],
};

export const STAFF_NAV: NavSection = {
  id: 'staff',
  label: 'Staff',
  items: [
    { href: '/mod', label: 'Moderation queue', icon: 'shield' },
    { href: '/mod/approvals', label: 'Approvals', icon: 'shield' },
    { href: '/mod/appeals', label: 'Appeal reviews', icon: 'shield' },
  ],
};

export function isStaffViewer(viewer: Viewer): boolean {
  return viewer.kind === 'signed_in' && (viewer.role === 'moderator' || viewer.role === 'admin');
}

export function navSectionsFor(viewer: Viewer): readonly NavSection[] {
  if (viewer.kind === 'anonymous') return [PRIMARY_NAV];
  return isStaffViewer(viewer) ? [PRIMARY_NAV, ACCOUNT_NAV, STAFF_NAV] : [PRIMARY_NAV, ACCOUNT_NAV];
}

export function isActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.href) return true;
  const prefix = item.matchPrefix;
  return prefix !== undefined && (pathname === prefix || pathname.startsWith(`${prefix}/`));
}
