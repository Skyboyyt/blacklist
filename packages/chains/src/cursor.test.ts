import { describe, it, expect } from 'vitest';
import { createCursorCodec } from './cursor.ts';
describe('provider-scoped history cursor', () => {
  it('binds provider, chain, address, snapshot, direction, limit and expiry; rejects tampering', () => {
    let now = 0;
    const codec = createCursorCodec(() => now),
      expected = {
        chainId: 'eip155:1',
        address: '0x' + '1'.repeat(40),
        limit: 20,
        direction: 'all' as const,
      };
    const cursor = codec.encode({
      ...expected,
      providerId: 'node-a',
      cursor: 'opaque-provider-page',
      snapshot: { kind: 'evm_block', blockNumber: '10', blockHash: '0x' + 'a'.repeat(64) },
    });
    expect(codec.decode(cursor, expected)).toMatchObject({
      providerId: 'node-a',
      cursor: 'opaque-provider-page',
    });
    expect(Buffer.from(cursor, 'base64url').toString('utf8')).not.toContain('opaque-provider-page');
    expect(() => codec.decode(cursor + 'a', expected)).toThrow();
    expect(() => codec.decode(cursor, { ...expected, address: '0x' + '2'.repeat(40) })).toThrow();
    expect(() => codec.decode(cursor, { ...expected, limit: 100 })).toThrow();
    expect(() => createCursorCodec().decode(cursor, expected)).toThrow();
    now = 300001;
    expect(() => codec.decode(cursor, expected)).toThrow();
  });
});
