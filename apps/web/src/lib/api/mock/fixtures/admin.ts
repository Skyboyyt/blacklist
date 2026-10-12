/**
 * Fictional administrator fixtures (development and tests only). Handles and masked
 * emails are made up; `example.test` is a reserved test domain.
 */
import type { AdminLabel, Invitation, MemberAccount, StaffMember } from '@blacklist/contracts';
import { EVM } from './ids';
import { STAFF } from './moderation';

export const STAFF_MEMBER_FIXTURES: readonly StaffMember[] = [
  {
    id: STAFF.admin.id,
    handle: STAFF.admin.handle,
    emailMasked: 'd•••@example.test',
    roles: ['admin'],
    status: 'active',
    authenticators: 2,
    lastActiveAt: '2026-09-28T09:00:00Z',
  },
  {
    id: STAFF.adminB.id,
    handle: STAFF.adminB.handle,
    emailMasked: 'd•••@example.test',
    roles: ['admin'],
    status: 'active',
    authenticators: 2,
    lastActiveAt: '2026-09-27T16:00:00Z',
  },
  {
    id: STAFF.moderatorA.id,
    handle: STAFF.moderatorA.handle,
    emailMasked: 'd•••@example.test',
    roles: ['moderator'],
    status: 'active',
    authenticators: 2,
    lastActiveAt: '2026-09-28T10:30:00Z',
  },
  {
    id: STAFF.moderatorB.id,
    handle: STAFF.moderatorB.handle,
    emailMasked: 'd•••@example.test',
    roles: ['moderator'],
    status: 'active',
    authenticators: 2,
    lastActiveAt: '2026-09-28T08:15:00Z',
  },
  {
    id: STAFF.appealReviewer.id,
    handle: STAFF.appealReviewer.handle,
    emailMasked: 'd•••@example.test',
    roles: ['appeal_reviewer'],
    status: 'active',
    authenticators: 2,
    lastActiveAt: '2026-09-25T14:00:00Z',
  },
  {
    id: 'stf_mod_c',
    handle: 'demo_moderator_c',
    emailMasked: 'd•••@example.test',
    roles: ['moderator'],
    status: 'active',
    authenticators: 0,
    lastActiveAt: '2026-09-10T11:00:00Z',
  },
];

/**
 * Fictional emails of existing accounts (`<handle>@example.test`). Invitations are for
 * new accounts only (identity §10.4), so the service refuses these.
 */
export const KNOWN_ACCOUNT_EMAILS: readonly string[] = [
  ...[
    'demo_admin',
    'demo_admin_b',
    'demo_moderator',
    'demo_moderator_b',
    'demo_appeal_reviewer',
    'demo_moderator_c',
  ],
  ...['demo_member', 'demo_researcher', 'demo_flooder'],
].map((handle) => `${handle}@example.test`);

/** An admin invitation waiting for a second administrator (identity §10.4). */
export const INVITATION_FIXTURES: readonly Invitation[] = [
  {
    id: 'INV-1001',
    emailMasked: 'n•••@example.test',
    role: 'admin',
    state: 'pending_approval',
    invitedBy: STAFF.admin,
    approvedBy: null,
    requiresSecondApproval: true,
    createdAt: '2026-09-27T10:00:00Z',
    expiresAt: '2026-09-30T10:00:00Z',
  },
];

export const MEMBER_ACCOUNT_FIXTURES: readonly MemberAccount[] = [
  {
    id: 'usr_demo_member',
    handle: 'demo_member',
    status: 'active',
    joinedAt: '2026-08-01T09:00:00Z',
    openSubmissions: 0,
    suspensionReason: null,
  },
  {
    id: 'usr_demo_researcher',
    handle: 'demo_researcher',
    status: 'active',
    joinedAt: '2026-08-14T12:00:00Z',
    openSubmissions: 0,
    suspensionReason: null,
  },
  {
    id: 'usr_demo_flooder',
    handle: 'demo_flooder',
    status: 'suspended',
    joinedAt: '2026-09-02T08:00:00Z',
    openSubmissions: 0,
    suspensionReason: 'Repeated duplicate reports after a warning.',
  },
];

export const LABEL_FIXTURES: readonly AdminLabel[] = [
  {
    id: 'LBL-1001',
    subject: {
      chain: 'ethereum',
      address: EVM.contractWithDisclosures,
      displayAddress: EVM.contractWithDisclosures,
    },
    text: 'Demo bridge router contract',
    provenance: 'moderator_finding',
    sourceName: null,
    basisNote: 'Staff matched the deployment to the fictional project’s published contract list.',
    status: 'active',
    createdBy: STAFF.admin,
    createdAt: '2026-09-01T10:00:00Z',
    retiredAt: null,
  },
];
