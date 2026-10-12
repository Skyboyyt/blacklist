/**
 * Fictional identifiers used by the mock adapter. They follow a deliberate
 * `b1ac…` / `Demo…` pattern so they are recognisable as test data. They are not
 * known to belong to anyone; never replace them with real addresses.
 */

/** Present in every mock build and absent from production builds (scripts/check-mock-exclusion.mjs). */
export const MOCK_FIXTURE_MARKER = 'BLACKLIST_MOCK_FIXTURE_DO_NOT_SHIP';

const evm = (suffix: string) => `0xb1ac${suffix.padStart(36, '0')}`;

export const EVM = {
  notAssessed: evm('0'),
  low: evm('1'),
  /** Low band with capability disclosures (zero contribution). */
  contractWithDisclosures: evm('2'),
  high: evm('3'),
  severeUnderAppeal: evm('4'),
  suspended: evm('5'),
  /** Search and research return `provider_unavailable`. */
  providerUnavailable: evm('ee'),
  /** Research throws, exercising the error boundary. */
  error: evm('ff'),
} as const;

export const SOLANA = {
  lookalikeToken: 'DemoTokenMintBLackListFixture1111111111111',
  wallet: 'DemoWa11etBLackListFixture22222222222222222',
} as const;

export const TX = {
  ethereum: `0xb1ac${'0'.repeat(59)}1`,
  solana: `DemoSig${'2'.repeat(81)}`,
} as const;

/** 40 hex characters without `0x` that are also valid base58: the search asks for a network. */
export const AMBIGUOUS_INPUT = 'b1acb1acb1acb1acb1acb1acb1acb1acb1acb1ac';

/** Mock auth rules (`*.example.test` is a reserved, non-routable domain). */
export const MOCK_AUTH = {
  memberEmail: 'member@example.test',
  staffEmail: 'staff@example.test',
  rateLimitedEmail: 'limited@example.test',
  errorEmail: 'error@example.test',
  unavailableEmail: 'unavailable@example.test',
  takenHandle: 'taken',
} as const;

export const FIXED_NOW = '2026-09-28T10:15:00Z';
