/**
 * Mock research adapter (development and tests only; never in production builds).
 *
 * Fixtures are parsed with the public contract schemas at load time, so a fixture
 * that drifts from the contract (for example by adding a numeric score) fails fast.
 */
import {
  addressResearchSchema,
  dashboardSchema,
  searchResponseSchema,
  transactionResearchSchema,
  type AddressResearch,
  type SearchHit,
  type SearchResponse,
  type TransactionResearch,
  type Viewer,
} from '@blacklist/contracts';
import { classifyInput } from '@/lib/search/classify';
import type { ResearchApi, ResearchResult } from '../types';
import { ADDRESS_FIXTURES } from './fixtures/addresses';
import { DASHBOARD_FIXTURE, VIEWER_FIXTURES } from './fixtures/dashboard';
import { EVM } from './fixtures/ids';
import { PROJECT_ADDRESS_FIXTURES } from './fixtures/projects';
import { TRANSACTION_FIXTURES } from './fixtures/transactions';
import { rankProjects } from './scoreboard';
import { createProjectCatalog } from './project-api';
import { createStore, sessionIdFrom, storeFor, type MockStore } from './store';

// Fixtures are validated against the public contracts when the mock loads (fail fast).
addressResearchSchema.array().parse([...ADDRESS_FIXTURES, ...PROJECT_ADDRESS_FIXTURES]);
const transactions = transactionResearchSchema.array().parse(TRANSACTION_FIXTURES);
const dashboard = dashboardSchema.parse(DASHBOARD_FIXTURE);

export interface MockOptions {
  /** Value of the mock viewer cookie: anonymous | member | moderator | admin. Defaults to member. */
  readonly viewer?: string | undefined;
  /** Value of the mock scenario cookie; `session_expired` makes the viewer anonymous with that reason. */
  readonly scenario?: string | undefined;
  /** Simulated latency so loading states are visible in development. */
  readonly latencyMs?: number;
  /** Shared demo store; a fresh one from the fixtures when omitted (unit tests). */
  readonly store?: MockStore;
  /** Demo session id (cookie value); selects the shared store when `store` is omitted. */
  readonly sessionId?: string | undefined;
}

const DEFAULT_LATENCY_MS = 350;
const UNAVAILABLE = { kind: 'provider_unavailable', retryAfterSeconds: 30 } as const;

function delay(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function findAddress(
  addresses: readonly AddressResearch[],
  chain: string,
  address: string,
): AddressResearch | undefined {
  const canonical = chain === 'ethereum' ? address.toLowerCase() : address;
  return addresses.find((a) => a.chain === chain && a.address === canonical);
}

function findTransaction(chain: string, hash: string): TransactionResearch | undefined {
  const canonical = chain === 'ethereum' ? hash.toLowerCase() : hash;
  return transactions.find((t) => t.chain === chain && t.hash === canonical);
}

function addressHit(a: AddressResearch): SearchHit {
  return {
    kind: 'address',
    chain: a.chain,
    id: a.address,
    displayId: a.displayAddress,
    band: a.assessment.band,
    summary: a.assessment.explanation,
  };
}

const NETWORK_NAMES = { ethereum: 'Ethereum', solana: 'Solana' } as const;

/** An explicitly chosen network is never silently replaced by another one. */
function wrongNetwork(chain: 'ethereum' | 'solana', what: string): SearchResponse {
  return { kind: 'invalid_identifier', reason: `This is not a valid ${NETWORK_NAMES[chain]} ${what}.` };
}

function mockSearch(
  addresses: readonly AddressResearch[],
  query: string,
  chain?: 'ethereum' | 'solana',
): SearchResponse {
  const c = classifyInput(query);
  switch (c.kind) {
    case 'empty':
    case 'invalid':
      return { kind: 'invalid_identifier', reason: c.kind === 'invalid' ? c.reason : 'Enter a search term.' };
    case 'unsupported':
      return { kind: 'unsupported_network', network: c.network };
    case 'ambiguous_address': {
      if (chain) {
        // The user chose a network: look the value up there only (Solana keeps its case).
        const value = chain === 'ethereum' ? `0x${query.trim().toLowerCase()}` : query.trim();
        const found = findAddress(addresses, chain, value);
        return found ? { kind: 'results', hits: [addressHit(found)] } : { kind: 'not_found' };
      }
      const value = query.trim();
      return {
        kind: 'choose_network',
        candidates: [
          {
            chain: 'ethereum',
            interpretedAs: `0x${value.toLowerCase()}`,
            note: 'Ethereum address without the 0x prefix',
          },
          { chain: 'solana', interpretedAs: value, note: 'Solana address (case-sensitive)' },
        ],
      };
    }
    case 'address': {
      if (chain && !c.chains.includes(chain)) return wrongNetwork(chain, 'address');
      if (c.normalized === EVM.providerUnavailable) return UNAVAILABLE;
      if (c.normalized === EVM.error) throw new Error('Mock failure for the error-state fixture.');
      const hits = (chain ? [chain] : c.chains)
        .map((ch) => findAddress(addresses, ch, c.normalized))
        .filter((a): a is AddressResearch => a !== undefined)
        .map(addressHit);
      return hits.length > 0 ? { kind: 'results', hits } : { kind: 'not_found' };
    }
    case 'transaction': {
      if (chain && chain !== c.chain) return wrongNetwork(chain, 'transaction hash');
      const tx = findTransaction(c.chain, c.normalized);
      if (!tx) return { kind: 'not_found' };
      return {
        kind: 'results',
        hits: [
          {
            kind: 'transaction',
            chain: tx.chain,
            id: tx.hash,
            displayId: tx.hash,
            band: null,
            summary: `${tx.status === 'success' ? 'Successful' : 'Failed'} transaction, ${tx.blockOrSlot}`,
          },
        ],
      };
    }
  }
}

export function createMockResearchApi(options: MockOptions = {}): ResearchApi {
  const latency = options.latencyMs ?? DEFAULT_LATENCY_MS;
  const store =
    options.store ??
    (options.sessionId !== undefined
      ? storeFor(sessionIdFrom(`bl_mock_session=${options.sessionId}`))
      : createStore());
  const projects = createProjectCatalog(store);
  const viewerKey = options.viewer;
  const viewer: Viewer =
    options.scenario === 'session_expired'
      ? { kind: 'anonymous', reason: 'session_expired' }
      : viewerKey !== undefined && viewerKey in VIEWER_FIXTURES
        ? VIEWER_FIXTURES[viewerKey as keyof typeof VIEWER_FIXTURES]
        : VIEWER_FIXTURES.member;

  return {
    async getViewer() {
      return viewer;
    },
    async search(request) {
      await delay(latency);
      return searchResponseSchema.parse(mockSearch(store.addresses, request.query, request.chain));
    },
    async getAddressResearch(chain, address): Promise<ResearchResult<AddressResearch>> {
      await delay(latency);
      const c = classifyInput(address);
      if (c.kind !== 'address' || !c.chains.includes(chain)) {
        return {
          kind: 'invalid_identifier',
          reason: `This is not a valid ${chain === 'ethereum' ? 'Ethereum' : 'Solana'} address.`,
        };
      }
      if (c.normalized === EVM.providerUnavailable) return UNAVAILABLE;
      if (c.normalized === EVM.error) throw new Error('Mock failure for the error-state fixture.');
      const found = findAddress(store.addresses, chain, c.normalized);
      return found ? { kind: 'found', data: structuredClone(found) } : { kind: 'not_found' };
    },
    async getTransactionResearch(chain, hash): Promise<ResearchResult<TransactionResearch>> {
      await delay(latency);
      const c = classifyInput(hash);
      if (c.kind !== 'transaction' || c.chain !== chain) {
        return {
          kind: 'invalid_identifier',
          reason: 'This is not a valid transaction identifier for this network.',
        };
      }
      const found = findTransaction(chain, c.normalized);
      return found ? { kind: 'found', data: found } : { kind: 'not_found' };
    },
    async getDashboard() {
      await delay(latency);
      if (viewer.kind !== 'signed_in') return dashboard;
      const handle = viewer.handle;
      const memberStatus = (status: string) =>
        ['submitted', 'screening', 'queued'].includes(status)
          ? ('submitted' as const)
          : status === 'in_review'
            ? ('in_review' as const)
            : status === 'needs_info'
              ? ('needs_information' as const)
              : ('closed' as const);
      const myReports = [...store.cases.values()]
        .filter((c) => c.type === 'report_review' && store.owners.get(c.id) === handle)
        .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
        .map((c) => ({
          id: c.id,
          title: c.title,
          status: memberStatus(c.status),
          submittedAt: c.submittedAt,
          updatedAt: c.lastActivityAt,
        }));
      const notices = store.notices
        .filter((n) => n.handle === handle)
        .map((n) => ({ id: n.id, text: n.text, at: n.at }));
      return dashboardSchema.parse({ recentSearches: dashboard.recentSearches, myReports, notices });
    },
    async listProjects(request) {
      await delay(latency);
      return projects.list(request);
    },
    async getScoreboard(request) {
      await delay(latency);
      return rankProjects(projects.details, request.chain);
    },
    async getProject(slug) {
      await delay(latency);
      return projects.get(slug);
    },
  };
}
