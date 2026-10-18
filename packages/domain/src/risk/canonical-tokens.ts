// Reviewed list of well-known Ethereum mainnet tokens for `token.symbol_impersonation`
// (ADR 0021). A token whose on-chain symbol normalises to one of these symbols, at any other
// address, impersonates it. Change only by reviewed PR; addresses are lowercase.

export const CANONICAL_ETHEREUM_TOKENS: Readonly<Record<string, readonly string[]>> = {
  USDT: ['0xdac17f958d2ee523a2206206994597c13d831ec7'],
  USDC: ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'],
  DAI: ['0x6b175474e89094c44da98b954eedeac495271d0f'],
  WETH: ['0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'],
  WBTC: ['0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'],
  LINK: ['0x514910771af9ca656af840dff83e8264ecf986ca'],
  UNI: ['0x1f9840a85d5af5bf1d1762f925bdaddc4201f984'],
  SHIB: ['0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce'],
  PEPE: ['0x6982508145454ce325ddbe47a25d4ec3d2311933'],
  STETH: ['0xae7ab96520de3a18e5e111b5eaab095312d7fe84'],
  AAVE: ['0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9'],
};

/** Cyrillic and Greek capitals and lowercase letters that look like Latin ones. */
const LOOKALIKES: Readonly<Record<string, string>> = {
  А: 'A',
  В: 'B',
  Е: 'E',
  К: 'K',
  М: 'M',
  Н: 'H',
  О: 'O',
  Р: 'P',
  С: 'C',
  Т: 'T',
  Ѕ: 'S',
  І: 'I',
  Ј: 'J',
  Х: 'X',
  У: 'Y',
  а: 'A',
  е: 'E',
  о: 'O',
  р: 'P',
  с: 'C',
  у: 'Y',
  х: 'X',
  і: 'I',
  ѕ: 'S',
  Α: 'A',
  Β: 'B',
  Ε: 'E',
  Ζ: 'Z',
  Η: 'H',
  Ι: 'I',
  Κ: 'K',
  Μ: 'M',
  Ν: 'N',
  Ο: 'O',
  Ρ: 'P',
  Τ: 'T',
  Υ: 'Y',
  Χ: 'X',
  ο: 'O',
  ν: 'V',
};

/** NFKC, invisible and space characters removed, lookalike letters mapped, upper case. */
export function normaliseSymbol(symbol: string): string {
  return [...symbol.normalize('NFKC').replace(/[\p{Cf}\p{Z}\s]/gu, '')]
    .map((c) => LOOKALIKES[c] ?? c)
    .join('')
    .toUpperCase();
}

/** The well-known symbol this token imitates, or null when it is canonical or unrelated. */
export function impersonatedSymbol(address: string, symbol: string | null): string | null {
  if (!symbol) return null;
  const normalised = normaliseSymbol(symbol);
  const canonical = CANONICAL_ETHEREUM_TOKENS[normalised];
  if (!canonical) return null;
  return canonical.includes(address.toLowerCase()) ? null : normalised;
}

export const isCanonicalToken = (address: string) =>
  Object.values(CANONICAL_ETHEREUM_TOKENS).some((list) => list.includes(address.toLowerCase()));
