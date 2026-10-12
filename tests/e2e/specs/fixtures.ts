/** Fictional identifiers mirrored from apps/web/src/lib/api/mock/fixtures/ids.ts. */
const evm = (suffix: string) => `0xb1ac${suffix.padStart(36, '0')}`;

export const EVM = {
  notAssessed: evm('0'),
  low: evm('1'),
  contractWithDisclosures: evm('2'),
  high: evm('3'),
  severeUnderAppeal: evm('4'),
  suspended: evm('5'),
  providerUnavailable: evm('ee'),
  error: evm('ff'),
  unknown: evm('abcd'),
};

export const SOLANA_TOKEN = 'DemoTokenMintBLackListFixture1111111111111';
export const AMBIGUOUS = 'b1acb1acb1acb1acb1acb1acb1acb1acb1acb1ac';
