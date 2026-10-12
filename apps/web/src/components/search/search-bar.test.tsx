import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../../../test/a11y';
import { SearchBar } from './search-bar';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

beforeEach(() => push.mockClear());

async function typeAndDetect(value: string) {
  const user = userEvent.setup();
  await user.type(screen.getByRole('searchbox'), value);
  return user;
}

const status = () => screen.getByRole('search').querySelector('[aria-live="polite"]');

describe('SearchBar', () => {
  it('starts idle with guidance', () => {
    render(<SearchBar />);
    expect(status()).toHaveAttribute('data-status', 'idle');
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
  });

  it('shows "detecting" while typing, then the detected format', async () => {
    render(<SearchBar />);
    await typeAndDetect(`0x${'ab'.repeat(20)}`);
    expect(status()).toHaveAttribute('data-status', 'typing');
    expect(screen.getByText('Detecting format…')).toBeInTheDocument();
    expect(await screen.findByText(/Ethereum address detected/)).toBeInTheDocument();
    expect(status()).toHaveAttribute('data-status', 'address');
  });

  it('asks the user to choose a network for ambiguous input and searches on the chosen one', async () => {
    render(<SearchBar />);
    const user = await typeAndDetect('b1acb1acb1acb1acb1acb1acb1acb1acb1acb1ac');
    expect(await screen.findByText('Address detected — choose network')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Search on Solana' }));
    expect(push).toHaveBeenCalledWith('/search?q=b1acb1acb1acb1acb1acb1acb1acb1acb1acb1ac&chain=solana');
  });

  it('explains invalid and unsupported input', async () => {
    render(<SearchBar />);
    const user = await typeAndDetect('0x1234');
    expect(
      await screen.findByText(/Ethereum addresses are 0x followed by 40 hex characters/),
    ).toBeInTheDocument();
    expect(status()).toHaveAttribute('data-status', 'invalid');
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'example.eth');
    expect(await screen.findByText(/not supported yet/)).toBeInTheDocument();
    expect(status()).toHaveAttribute('data-status', 'unsupported');
  });

  it('submits to the results page', async () => {
    render(<SearchBar />);
    await typeAndDetect('example{Enter}');
    expect(push).toHaveBeenCalledWith('/search?q=example');
  });

  it('is labelled and has no detectable accessibility violations', async () => {
    const { container } = render(<SearchBar initialValue="0x12" />);
    expect(screen.getByRole('searchbox', { name: 'Address or transaction hash' })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
