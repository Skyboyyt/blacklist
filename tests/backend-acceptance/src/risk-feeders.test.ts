import { describe, it, expect } from 'vitest';
import { normaliseSymbol, impersonatedSymbol, isCanonicalToken } from '@blacklist/domain';

// ADR 0021: the symbol rule behind `token.symbol_impersonation`.
const USDT = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const other = '0x' + '1'.repeat(40);

describe('token symbol impersonation rule', () => {
  it('normalises case, width, invisible characters and lookalike letters', () => {
    expect(normaliseSymbol('usdt')).toBe('USDT');
    expect(normaliseSymbol('ＵＳＤＴ')).toBe('USDT');
    expect(normaliseSymbol('US​DT')).toBe('USDT');
    expect(normaliseSymbol(' USD T ')).toBe('USDT');
    expect(normaliseSymbol('USDТ')).toBe('USDT'); // Cyrillic Т
    expect(normaliseSymbol('ЅΗΙΒ')).toBe('SHIB'); // Cyrillic Ѕ, Greek Η Ι Β
  });

  it('flags a well-known symbol at another address, never the canonical token or unrelated symbols', () => {
    expect(impersonatedSymbol(other, 'USDT')).toBe('USDT');
    expect(impersonatedSymbol(other, 'stETH')).toBe('STETH');
    expect(impersonatedSymbol(USDT, 'USDT')).toBeNull();
    expect(impersonatedSymbol(USDT.toUpperCase().replace('0X', '0x'), 'USDT')).toBeNull();
    expect(impersonatedSymbol(other, 'USDT2')).toBeNull();
    expect(impersonatedSymbol(other, 'FICTION')).toBeNull();
    expect(impersonatedSymbol(other, null)).toBeNull();
    expect(isCanonicalToken(USDT)).toBe(true);
    expect(isCanonicalToken(other)).toBe(false);
  });
});
