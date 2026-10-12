/**
 * Fictional project profiles. All names, domains and addresses are invented and use
 * the recognisable `Demo` / `0xb1ac…` / `.example` patterns.
 *
 * A profile lists official addresses by reference; the mock composes each address's
 * own assessment and disclosures from the address research fixtures, so project and
 * address pages always agree. There is no combined project rating (Post-V1).
 */
import type {
  AddressResearch,
  AttributionBasis,
  ChainSlugDto,
  OfficialDomain,
  ProjectCategory,
  ProjectDetail,
  ProjectHistoryEvent,
  ProjectResponse,
} from '@blacklist/contracts';
import { EVM, FIXED_NOW, PROJECT_EVM, PROJECT_SOLANA, SOLANA } from './ids';

export interface ProjectAddressRef {
  readonly chain: ChainSlugDto;
  readonly address: string;
  readonly role: 'token' | 'contract' | 'program' | 'treasury' | 'deployer' | 'other';
  readonly basis: AttributionBasis;
  readonly basisNote: string;
  readonly attributedAt: string;
  /** Simulates an assessment that cannot be loaded right now. */
  readonly assessmentUnavailable?: true;
}

/** A project profile record. The mock store keeps mutable per-session copies. */
export interface ProjectFixture {
  slug: string;
  name: string;
  category: ProjectCategory;
  description: string;
  addresses: ProjectAddressRef[];
  domains: OfficialDomain[];
  responses: ProjectResponse[];
  history: ProjectHistoryEvent[];
  profileRevision: number;
  lastReviewedAt: string;
  updatedAt: string;
  freshness: ProjectDetail['freshness'];
}

/** Detail slugs that exercise failure states; they are not listed in the directory. */
export const PROJECT_SPECIAL_SLUGS = { unavailable: 'demo-provider-down', error: 'demo-error' } as const;
/** Directory queries that exercise failure states. */
export const PROJECT_SPECIAL_QUERIES = { unavailable: 'provider-down-demo', error: 'error-demo' } as const;

const ANNOUNCED = 'Listed in an announcement on the project’s official domain, reviewed by staff.';
const DEPLOYED = 'Deployed by an address the project announced as its deployer (blockchain record).';

function domain(hostname: string, attributedAt: string): OfficialDomain {
  return {
    hostname,
    basis: 'staff_documentary_review',
    basisNote: 'Staff reviewed registration and announcement records for this domain.',
    attributedAt,
  };
}

function created(slug: string, at: string): ProjectHistoryEvent {
  return {
    id: `${slug}-h0`,
    kind: 'profile_created',
    label: 'Profile created by staff',
    at,
    actor: 'moderator',
  };
}

/** Minimal research records for addresses that are only reachable through project profiles. */
export function projectOnlyAddress(
  chain: ChainSlugDto,
  address: string,
  kind: AddressResearch['kind'],
  band: 'low' | 'not_assessed',
): AddressResearch {
  return {
    chain,
    address,
    displayAddress: address,
    kind,
    untrustedLabel: null,
    assessment: {
      band,
      explanation:
        band === 'low'
          ? 'No published findings or approved analysis indicators apply to this address.'
          : 'There is not enough finalized data for this address to assess it.',
      factors: [],
      confidence: band === 'low' ? 'medium' : 'low',
      coverage:
        band === 'low'
          ? 'Balances and recent transactions were available.'
          : 'Only a small amount of finalized activity was available.',
      asOf: FIXED_NOW,
      rulesetVersion: 'v1-demo',
      disputeState: 'none',
      suppressions: [],
    },
    facts: [],
    disclosures: [],
    labels: [],
    findings: [],
    responses: [],
    transfers: [],
    evidence: [],
    timeline: [],
  };
}

export const PROJECT_ADDRESS_FIXTURES: readonly AddressResearch[] = [
  projectOnlyAddress('ethereum', PROJECT_EVM.bridge, 'contract', 'low'),
  projectOnlyAddress('ethereum', PROJECT_EVM.exchange, 'wallet', 'low'),
  projectOnlyAddress('ethereum', PROJECT_EVM.stale, 'contract', 'low'),
  projectOnlyAddress('ethereum', PROJECT_EVM.unavailable, 'contract', 'low'),
  projectOnlyAddress('solana', PROJECT_SOLANA.daoTreasury, 'wallet', 'not_assessed'),
  projectOnlyAddress('solana', PROJECT_SOLANA.nftMarket, 'contract', 'low'),
  projectOnlyAddress('solana', PROJECT_SOLANA.exchange, 'wallet', 'low'),
];

export const PROJECT_FIXTURES: readonly ProjectFixture[] = [
  {
    slug: 'demoswap',
    name: 'DemoSwap',
    category: 'defi',
    description:
      'A fictional token-swap protocol used to demonstrate a profile with capability disclosures and no published findings.',
    addresses: [
      {
        chain: 'ethereum',
        address: EVM.contractWithDisclosures,
        role: 'contract',
        basis: 'official_announcement',
        basisNote: ANNOUNCED,
        attributedAt: '2026-08-02T09:00:00Z',
      },
    ],
    domains: [domain('demoswap.example', '2026-08-02T09:00:00Z')],
    responses: [],
    history: [
      created('demoswap', '2026-08-02T09:00:00Z'),
      {
        id: 'demoswap-h1',
        kind: 'official_address_added',
        label: 'Router contract added as an official address',
        at: '2026-08-02T09:05:00Z',
        actor: 'moderator',
      },
    ],
    profileRevision: 2,
    lastReviewedAt: '2026-09-20T12:00:00Z',
    updatedAt: '2026-09-20T12:00:00Z',
    freshness: { state: 'current', note: null },
  },
  {
    slug: 'demo-rewards-hub',
    name: 'Demo Rewards Hub',
    category: 'token',
    description:
      'A fictional rewards site. A severe finding about its claim contract is published and currently under appeal.',
    addresses: [
      {
        chain: 'ethereum',
        address: EVM.severeUnderAppeal,
        role: 'contract',
        basis: 'deployment_record',
        basisNote: DEPLOYED,
        attributedAt: '2026-07-11T10:00:00Z',
      },
    ],
    domains: [domain('rewards-hub.example', '2026-07-11T10:00:00Z')],
    responses: [
      {
        id: 'resp-501',
        summary:
          'The project states that the claim contract was operated by a former contractor without authorization and has filed an appeal with supporting documents.',
        standing: 'documentary',
        standingProvenAt: '2026-09-24T15:00:00Z',
        publishedAt: '2026-09-25T08:00:00Z',
      },
    ],
    history: [
      created('demo-rewards-hub', '2026-07-11T10:00:00Z'),
      {
        id: 'demo-rewards-hub-h1',
        kind: 'finding_published',
        label: 'Severe finding published after independent approval',
        at: '2026-09-02T14:00:00Z',
        actor: 'system',
      },
      {
        id: 'demo-rewards-hub-h2',
        kind: 'appeal_filed',
        label: 'Appeal filed by the project (documentary standing)',
        at: '2026-09-24T16:30:00Z',
        actor: 'subject',
      },
      {
        id: 'demo-rewards-hub-h3',
        kind: 'response_published',
        label: 'Response from the project published',
        at: '2026-09-25T08:00:00Z',
        actor: 'subject',
      },
    ],
    profileRevision: 3,
    lastReviewedAt: '2026-09-25T08:00:00Z',
    updatedAt: '2026-09-25T08:00:00Z',
    freshness: { state: 'current', note: null },
  },
  {
    slug: 'demo-yield-vault',
    name: 'Demo Yield Vault',
    category: 'defi',
    description:
      'A fictional investment scheme. A high-severity finding about its collection wallet is published.',
    addresses: [
      {
        chain: 'ethereum',
        address: EVM.high,
        role: 'treasury',
        basis: 'staff_documentary_review',
        basisNote: 'Staff matched this wallet to payment instructions on the project’s official pages.',
        attributedAt: '2026-08-20T11:00:00Z',
      },
    ],
    domains: [domain('yield-vault.example', '2026-08-20T11:00:00Z')],
    responses: [],
    history: [
      created('demo-yield-vault', '2026-08-20T11:00:00Z'),
      {
        id: 'demo-yield-vault-h1',
        kind: 'finding_published',
        label: 'High finding published',
        at: '2026-09-10T09:30:00Z',
        actor: 'system',
      },
    ],
    profileRevision: 2,
    lastReviewedAt: '2026-09-10T09:30:00Z',
    updatedAt: '2026-09-10T09:30:00Z',
    freshness: { state: 'current', note: null },
  },
  {
    slug: 'demo-lookalike-stable',
    name: 'Lookalike Stable (demo)',
    category: 'token',
    description:
      'A fictional token whose on-chain name imitates a well-known stablecoin. Its name alone does not identify it: check the mint address.',
    addresses: [
      {
        chain: 'solana',
        address: SOLANA.lookalikeToken,
        role: 'token',
        basis: 'staff_documentary_review',
        basisNote: 'Staff recorded this mint while reviewing impersonation reports.',
        attributedAt: '2026-09-01T07:00:00Z',
      },
    ],
    domains: [],
    responses: [],
    history: [created('demo-lookalike-stable', '2026-09-01T07:00:00Z')],
    profileRevision: 1,
    lastReviewedAt: '2026-09-01T07:00:00Z',
    updatedAt: '2026-09-01T07:00:00Z',
    freshness: { state: 'current', note: null },
  },
  {
    slug: 'demo-wallet-app',
    name: 'Demo Wallet App',
    category: 'wallet',
    description: 'A fictional wallet app with official addresses on Ethereum and Solana.',
    addresses: [
      {
        chain: 'ethereum',
        address: EVM.low,
        role: 'treasury',
        basis: 'official_announcement',
        basisNote: ANNOUNCED,
        attributedAt: '2026-06-15T10:00:00Z',
      },
      {
        chain: 'solana',
        address: SOLANA.wallet,
        role: 'treasury',
        basis: 'authority_signature',
        basisNote:
          'A message signed by this address named the project (checked against a finalized chain read).',
        attributedAt: '2026-06-15T10:30:00Z',
      },
    ],
    domains: [domain('wallet-app.example', '2026-06-15T10:00:00Z')],
    responses: [],
    history: [created('demo-wallet-app', '2026-06-15T10:00:00Z')],
    profileRevision: 1,
    lastReviewedAt: '2026-09-18T15:00:00Z',
    updatedAt: '2026-09-18T15:00:00Z',
    freshness: { state: 'current', note: null },
  },
  {
    slug: 'demo-paused-finding',
    name: 'Demo Paused Finding',
    category: 'other',
    description: 'A fictional profile whose only finding is temporarily suspended while it is reviewed.',
    addresses: [
      {
        chain: 'ethereum',
        address: EVM.suspended,
        role: 'treasury',
        basis: 'official_announcement',
        basisNote: ANNOUNCED,
        attributedAt: '2026-08-05T10:00:00Z',
      },
    ],
    domains: [],
    responses: [],
    history: [
      created('demo-paused-finding', '2026-08-05T10:00:00Z'),
      {
        id: 'demo-paused-finding-h1',
        kind: 'finding_suspended',
        label: 'Finding temporarily suspended pending review',
        at: '2026-09-26T12:00:00Z',
        actor: 'moderator',
      },
    ],
    profileRevision: 2,
    lastReviewedAt: '2026-09-26T12:00:00Z',
    updatedAt: '2026-09-26T12:00:00Z',
    freshness: { state: 'current', note: null },
  },
  {
    slug: 'demo-new-listing',
    name: 'Demo New Listing',
    category: 'nft',
    description: 'A fictional profile that staff created recently. No official addresses are listed yet.',
    addresses: [],
    domains: [domain('new-listing.example', '2026-09-27T09:00:00Z')],
    responses: [],
    history: [created('demo-new-listing', '2026-09-27T09:00:00Z')],
    profileRevision: 1,
    lastReviewedAt: '2026-09-27T09:00:00Z',
    updatedAt: '2026-09-27T09:00:00Z',
    freshness: { state: 'partial', note: 'Staff have not listed official addresses for this project yet.' },
  },
  {
    slug: 'demo-quiet-token',
    name: 'Demo Quiet Token',
    category: 'token',
    description:
      'A fictional token with very little finalized activity, so its address could not be assessed.',
    addresses: [
      {
        chain: 'ethereum',
        address: EVM.notAssessed,
        role: 'token',
        basis: 'deployment_record',
        basisNote: DEPLOYED,
        attributedAt: '2026-09-12T10:00:00Z',
      },
    ],
    domains: [],
    responses: [],
    history: [created('demo-quiet-token', '2026-09-12T10:00:00Z')],
    profileRevision: 1,
    lastReviewedAt: '2026-09-12T10:00:00Z',
    updatedAt: '2026-09-12T10:00:00Z',
    freshness: { state: 'current', note: null },
  },
  {
    slug: 'demo-dormant-protocol',
    name: 'Demo Dormant Protocol',
    category: 'infrastructure',
    description: 'A fictional protocol whose profile has not been re-reviewed for a long time.',
    addresses: [
      {
        chain: 'ethereum',
        address: PROJECT_EVM.stale,
        role: 'contract',
        basis: 'official_announcement',
        basisNote: ANNOUNCED,
        attributedAt: '2026-03-01T10:00:00Z',
      },
    ],
    domains: [domain('dormant.example', '2026-03-01T10:00:00Z')],
    responses: [],
    history: [created('demo-dormant-protocol', '2026-03-01T10:00:00Z')],
    profileRevision: 1,
    lastReviewedAt: '2026-03-01T10:00:00Z',
    updatedAt: '2026-03-01T10:00:00Z',
    freshness: {
      state: 'stale',
      note: 'Staff have not re-reviewed this profile since March 2026. Official addresses and domains may have changed.',
    },
  },
  {
    slug: 'demo-oracle-network',
    name: 'Demo Oracle Network',
    category: 'infrastructure',
    description: 'A fictional oracle service. Its address assessment cannot be loaded right now.',
    addresses: [
      {
        chain: 'ethereum',
        address: PROJECT_EVM.unavailable,
        role: 'contract',
        basis: 'deployment_record',
        basisNote: DEPLOYED,
        attributedAt: '2026-07-01T10:00:00Z',
        assessmentUnavailable: true,
      },
    ],
    domains: [domain('oracle-network.example', '2026-07-01T10:00:00Z')],
    responses: [],
    history: [created('demo-oracle-network', '2026-07-01T10:00:00Z')],
    profileRevision: 1,
    lastReviewedAt: '2026-09-05T10:00:00Z',
    updatedAt: '2026-09-05T10:00:00Z',
    freshness: { state: 'partial', note: 'Some assessment data is temporarily unavailable.' },
  },
  {
    slug: 'demo-bridge',
    name: 'Demo Bridge',
    category: 'infrastructure',
    description: 'A fictional cross-network bridge contract.',
    addresses: [
      {
        chain: 'ethereum',
        address: PROJECT_EVM.bridge,
        role: 'contract',
        basis: 'official_announcement',
        basisNote: ANNOUNCED,
        attributedAt: '2026-05-20T10:00:00Z',
      },
    ],
    domains: [domain('bridge.example', '2026-05-20T10:00:00Z')],
    responses: [],
    history: [created('demo-bridge', '2026-05-20T10:00:00Z')],
    profileRevision: 1,
    lastReviewedAt: '2026-09-14T10:00:00Z',
    updatedAt: '2026-09-14T10:00:00Z',
    freshness: { state: 'current', note: null },
  },
  {
    slug: 'demo-dao',
    name: 'Demo DAO',
    category: 'dao',
    description: 'A fictional on-chain organisation with a Solana treasury.',
    addresses: [
      {
        chain: 'solana',
        address: PROJECT_SOLANA.daoTreasury,
        role: 'treasury',
        basis: 'authority_signature',
        basisNote: 'A message signed by this address named the organisation.',
        attributedAt: '2026-08-08T10:00:00Z',
      },
    ],
    domains: [domain('dao.example', '2026-08-08T10:00:00Z')],
    responses: [],
    history: [created('demo-dao', '2026-08-08T10:00:00Z')],
    profileRevision: 1,
    lastReviewedAt: '2026-08-08T10:00:00Z',
    updatedAt: '2026-08-08T10:00:00Z',
    freshness: { state: 'current', note: null },
  },
  {
    slug: 'demo-nft-market',
    name: 'Demo NFT Market',
    category: 'nft',
    description: 'A fictional NFT marketplace program on Solana.',
    addresses: [
      {
        chain: 'solana',
        address: PROJECT_SOLANA.nftMarket,
        role: 'program',
        basis: 'official_announcement',
        basisNote: ANNOUNCED,
        attributedAt: '2026-07-22T10:00:00Z',
      },
    ],
    domains: [domain('nft-market.example', '2026-07-22T10:00:00Z')],
    responses: [],
    history: [created('demo-nft-market', '2026-07-22T10:00:00Z')],
    profileRevision: 1,
    lastReviewedAt: '2026-09-02T10:00:00Z',
    updatedAt: '2026-09-02T10:00:00Z',
    freshness: { state: 'current', note: null },
  },
  {
    slug: 'demo-exchange',
    name: 'Demo Exchange',
    category: 'exchange',
    description: 'A fictional exchange with hot wallets on both supported networks.',
    addresses: [
      {
        chain: 'ethereum',
        address: PROJECT_EVM.exchange,
        role: 'treasury',
        basis: 'official_announcement',
        basisNote: ANNOUNCED,
        attributedAt: '2026-04-10T10:00:00Z',
      },
      {
        chain: 'solana',
        address: PROJECT_SOLANA.exchange,
        role: 'treasury',
        basis: 'official_announcement',
        basisNote: ANNOUNCED,
        attributedAt: '2026-04-10T10:00:00Z',
      },
    ],
    domains: [domain('exchange.example', '2026-04-10T10:00:00Z')],
    responses: [],
    history: [created('demo-exchange', '2026-04-10T10:00:00Z')],
    profileRevision: 1,
    lastReviewedAt: '2026-09-22T10:00:00Z',
    updatedAt: '2026-09-22T10:00:00Z',
    freshness: { state: 'current', note: null },
  },
];
