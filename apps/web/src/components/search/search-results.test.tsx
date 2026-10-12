import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SearchResults } from './search-results';

describe('SearchResults states', () => {
  it('results link to the research page with the band', () => {
    render(
      <SearchResults
        query="x"
        response={{
          kind: 'results',
          hits: [
            {
              kind: 'address',
              chain: 'ethereum',
              id: '0xabc',
              displayId: '0xabc',
              band: 'high',
              summary: 'Summary text',
            },
          ],
        }}
      />,
    );
    expect(screen.getByRole('link', { name: /Summary text/ })).toHaveAttribute(
      'href',
      '/address/ethereum/0xabc',
    );
    expect(screen.getByText('High risk')).toBeInTheDocument();
  });

  it('choose network lists each candidate', () => {
    render(
      <SearchResults
        query="abc"
        response={{
          kind: 'choose_network',
          candidates: [
            { chain: 'ethereum', interpretedAs: '0xabc', note: 'n1' },
            { chain: 'solana', interpretedAs: 'abc', note: 'n2' },
          ],
        }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Address detected — choose network' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Search on Ethereum/ })).toHaveAttribute(
      'href',
      '/search?q=abc&chain=ethereum',
    );
    expect(screen.getByRole('link', { name: /Search on Solana/ })).toHaveAttribute(
      'href',
      '/search?q=abc&chain=solana',
    );
  });

  it('not found never implies safety', () => {
    render(<SearchResults query="x" response={{ kind: 'not_found' }} />);
    expect(screen.getByText('This is not a sign that it is safe.')).toBeInTheDocument();
  });

  it('provider unavailable says no assessment was made', () => {
    render(<SearchResults query="x" response={{ kind: 'provider_unavailable', retryAfterSeconds: 30 }} />);
    expect(screen.getByText(/No\s+assessment was made/)).toBeInTheDocument();
  });

  it('invalid identifier and unsupported network explain the problem', () => {
    const { rerender } = render(
      <SearchResults query="x" response={{ kind: 'invalid_identifier', reason: 'Bad format.' }} />,
    );
    expect(screen.getByText('Bad format.')).toBeInTheDocument();
    rerender(<SearchResults query="x" response={{ kind: 'unsupported_network', network: 'Bitcoin' }} />);
    expect(screen.getByText(/Bitcoin is not supported yet/)).toBeInTheDocument();
  });
});
