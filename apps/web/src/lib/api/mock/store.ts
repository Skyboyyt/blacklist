/**
 * Shared mock state (development and tests only; never in production builds).
 *
 * One in-memory store per demo session, held by the Next.js server process. Server
 * components read it directly; browser components reach it through the mock-only RPC
 * route. So a staff decision, a member submission and the public pages all see the
 * same data. A demo session is identified by the `bl_mock_session` cookie, which the
 * proxy sets in mock builds only. Everything here is synthetic and resets on demand.
 * Nothing is written to browser storage or to disk.
 */
import type {
  AddressResearch,
  AdminLabel,
  AuditEntry,
  CaseDetail,
  FindingRevision,
  FindingSummary,
  Invitation,
  MemberAccount,
  MemberNotice,
  RecoveryCase,
  RiskFactor,
  RoleRequest,
  StaffMember,
  StaffRef,
  Suppression,
} from '@blacklist/contracts';
import {
  INVITATION_FIXTURES,
  LABEL_FIXTURES,
  MEMBER_ACCOUNT_FIXTURES,
  STAFF_MEMBER_FIXTURES,
} from './fixtures/admin';
import { ADDRESS_FIXTURES } from './fixtures/addresses';
import {
  CASE_FIXTURES,
  CASE_OWNERS,
  FINDING_FACTORS,
  FINDING_PARTICIPANTS,
  REVISION_FIXTURES,
} from './fixtures/moderation';
import { PROJECT_ADDRESS_FIXTURES, PROJECT_FIXTURES, type ProjectFixture } from './fixtures/projects';

export const MOCK_SESSION_COOKIE = 'bl_mock_session';
const MAX_SESSIONS = 500;

export interface MockStore {
  addresses: AddressResearch[];
  projects: ProjectFixture[];
  cases: Map<string, CaseDetail>;
  /** caseId → handle of the member who submitted it. */
  owners: Map<string, string>;
  revisions: FindingRevision[];
  audit: AuditEntry[];
  /** Single-use grants keyed by actor, demo session, action and target, with exact parameters. */
  grants: Map<string, { parameters: string; expires: number }>;
  /** findingId → id of the risk factor it contributes. */
  findingFactors: Map<string, string>;
  /** findingId → author and approver, for appeal independence. */
  findingParticipants: Map<string, { author: StaffRef; approver: StaffRef; severity: string }>;
  findingParticipantHistory: Map<string, Set<string>>;
  notices: (MemberNotice & { handle: string })[];
  /** The one-time simulated concurrent edit on the conflict demo case. */
  conflictPending: boolean;
  /** Suspended findings: the public text and factor to restore if reinstated (moderation §8.3). */
  suspended: Map<string, { finding: FindingSummary; factor: RiskFactor | null }>;
  staff: StaffMember[];
  invitations: Invitation[];
  roleRequests: RoleRequest[];
  recoveries: RecoveryCase[];
  members: MemberAccount[];
  labels: AdminLabel[];
  /** Suppressions, with the factor each removed (restored when lifted). */
  suppressions: (Suppression & { removed: RiskFactor | null })[];
  /** Alerts every administrator must see. */
  alerts: { id: string; at: string; text: string }[];
  /** handle → private profile fields (PRD §5.3). */
  profiles: Map<string, { displayName: string | null; updatedAt: string }>;
  seq: number;
}

/** Puts active labels on their address records, as the public read model would. */
function withLabels(addresses: AddressResearch[], labels: readonly AdminLabel[]): AddressResearch[] {
  for (const l of labels) {
    if (l.status !== 'active') continue;
    const record = addresses.find((a) => a.chain === l.subject.chain && a.address === l.subject.address);
    record?.labels.push({
      id: l.id,
      text: l.text,
      provenance: l.provenance,
      sourceName: l.sourceName,
      addedAt: l.createdAt,
    });
  }
  return addresses;
}

export function createStore(): MockStore {
  return {
    addresses: withLabels(
      structuredClone([...ADDRESS_FIXTURES, ...PROJECT_ADDRESS_FIXTURES]),
      LABEL_FIXTURES,
    ),
    projects: structuredClone([...PROJECT_FIXTURES]),
    cases: new Map(CASE_FIXTURES.map((c) => [c.id, structuredClone(c)])),
    owners: new Map(Object.entries(CASE_OWNERS)),
    revisions: structuredClone([...REVISION_FIXTURES]),
    audit: CASE_FIXTURES.flatMap((c) => structuredClone(c.history)),
    grants: new Map(),
    findingFactors: new Map(Object.entries(FINDING_FACTORS)),
    findingParticipants: new Map(Object.entries(structuredClone(FINDING_PARTICIPANTS))),
    findingParticipantHistory: new Map(
      Object.entries(FINDING_PARTICIPANTS).map(([id, p]) => [id, new Set([p.author.id, p.approver.id])]),
    ),
    notices: [
      {
        handle: 'demo_member',
        id: 'notice-seed-1',
        text: 'Staff asked for more information about your report “Token pretending to be a stablecoin”.',
        at: '2026-09-23T16:00:00Z',
        href: '/reports/RPT-1003',
      },
    ],
    conflictPending: true,
    suspended: new Map(),
    staff: structuredClone([...STAFF_MEMBER_FIXTURES]),
    invitations: structuredClone([...INVITATION_FIXTURES]),
    roleRequests: [],
    recoveries: [],
    members: structuredClone([...MEMBER_ACCOUNT_FIXTURES]),
    labels: structuredClone([...LABEL_FIXTURES]),
    suppressions: [],
    alerts: [],
    profiles: new Map([['demo_member', { displayName: 'Demo Member', updatedAt: '2026-08-01T09:00:00Z' }]]),
    seq: 0,
  };
}

type Registry = Map<string, MockStore>;
const holder = globalThis as typeof globalThis & { __blacklistMockStores?: Registry };

function registry(): Registry {
  holder.__blacklistMockStores ??= new Map();
  return holder.__blacklistMockStores;
}

/** The store for a demo session, created from the fixtures on first use. */
export function storeFor(sessionId: string): MockStore {
  const stores = registry();
  let store = stores.get(sessionId);
  if (!store) {
    if (stores.size >= MAX_SESSIONS) {
      const oldest = stores.keys().next().value;
      if (oldest !== undefined) stores.delete(oldest);
    }
    store = createStore();
    stores.set(sessionId, store);
  }
  return store;
}

/** Deterministic reset: the session starts again from the fixtures. */
export function resetStore(sessionId: string): void {
  registry().delete(sessionId);
}

export function nextId(store: MockStore, prefix: string): string {
  store.seq += 1;
  return `${prefix}-${String(9000 + store.seq)}`;
}

export function sessionIdFrom(cookieHeader: string): string {
  const match = cookieHeader
    .split(/;\s*/)
    .find((c) => c.startsWith(`${MOCK_SESSION_COOKIE}=`))
    ?.slice(MOCK_SESSION_COOKIE.length + 1);
  return match && /^[A-Za-z0-9-]{8,64}$/.test(match) ? match : 'default';
}
