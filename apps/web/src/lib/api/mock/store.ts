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
  AuditEntry,
  CaseDetail,
  FindingRevision,
  MemberNotice,
  StaffRef,
} from '@blacklist/contracts';
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
  /** Single-use step-up grants: `${action}:${target}` → expiry (ms). */
  grants: Map<string, number>;
  /** findingId → id of the risk factor it contributes. */
  findingFactors: Map<string, string>;
  /** findingId → author and approver, for appeal independence. */
  findingParticipants: Map<string, { author: StaffRef; approver: StaffRef; severity: string }>;
  notices: (MemberNotice & { handle: string })[];
  /** The one-time simulated concurrent edit on the conflict demo case. */
  conflictPending: boolean;
  seq: number;
}

export function createStore(): MockStore {
  return {
    addresses: structuredClone([...ADDRESS_FIXTURES, ...PROJECT_ADDRESS_FIXTURES]),
    projects: structuredClone([...PROJECT_FIXTURES]),
    cases: new Map(CASE_FIXTURES.map((c) => [c.id, structuredClone(c)])),
    owners: new Map(Object.entries(CASE_OWNERS)),
    revisions: structuredClone([...REVISION_FIXTURES]),
    audit: CASE_FIXTURES.flatMap((c) => structuredClone(c.history)),
    grants: new Map(),
    findingFactors: new Map(Object.entries(FINDING_FACTORS)),
    findingParticipants: new Map(Object.entries(structuredClone(FINDING_PARTICIPANTS))),
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
