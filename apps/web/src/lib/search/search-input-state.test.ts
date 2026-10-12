import { describe, expect, it } from 'vitest';
import { initialSearchInputState, searchHref, searchInputReducer } from './search-input-state';

describe('searchInputReducer', () => {
  it('moves idle → typing → detected', () => {
    const typing = searchInputReducer(initialSearchInputState, { type: 'input', value: '0x12' });
    expect(typing.status).toBe('typing');
    const detected = searchInputReducer(typing, { type: 'detect' });
    expect(detected.status).toBe('detected');
    expect(detected.status === 'detected' && detected.classification.kind).toBe('invalid');
  });

  it('returns to idle when cleared or emptied', () => {
    const typing = searchInputReducer(initialSearchInputState, { type: 'input', value: 'abc' });
    expect(searchInputReducer(typing, { type: 'input', value: '  ' })).toEqual(initialSearchInputState);
    expect(searchInputReducer(typing, { type: 'clear' })).toEqual(initialSearchInputState);
  });

  it('ignores a stale detect event when not typing', () => {
    expect(searchInputReducer(initialSearchInputState, { type: 'detect' })).toBe(initialSearchInputState);
  });
});

describe('searchHref', () => {
  it('encodes the query and optional network', () => {
    expect(searchHref(' a b ')).toBe('/search?q=a+b');
    expect(searchHref('x&y', 'solana')).toBe('/search?q=x%26y&chain=solana');
  });
});
