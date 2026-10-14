import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { addressHistorySchema } from '@blacklist/contracts';
import { ChainDetails } from './chain-details';
describe('real chain detail presentation', () => {
  it('keeps source/coverage explicit and pagination direction intact with valid transaction navigation', () => {
    const address = '0x' + '1'.repeat(40),
      hash = '0x' + 'a'.repeat(64);
    const data = addressHistorySchema.parse({
      chain: 'ethereum',
      address,
      source: {
        chain: 'ethereum',
        source: 'Ethereum RPC',
        fetchedAt: '2026-10-01T00:00:00Z',
        finality: 'final',
        snapshot: { kind: 'evm_block', blockHash: '0x' + 'b'.repeat(64), blockNumber: '10' },
        verification: 'single_source',
        degraded: false,
      },
      items: [{ hash, block: '10', at: null, status: 'success', direction: 'self' }],
      nextCursor: 'opaque/page',
      truncated: true,
      restarted: false,
      coverage: 'Directional transfer index only; incomplete.',
    });
    render(
      <ChainDetails
        chain="ethereum"
        address={address}
        data={{ direction: 'in', history: { kind: 'found', data } }}
      />,
    );
    expect(screen.getByText(/Activity does not establish ownership or wrongdoing/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute(
      'href',
      `/address/ethereum/${address}?direction=in&cursor=opaque%2Fpage`,
    );
    expect(screen.getByRole('link', { name: /0xaaaa/ })).toHaveAttribute('href', `/tx/ethereum/${hash}`);
    expect(screen.getByText(/single_source/)).toBeInTheDocument();
  });
});
