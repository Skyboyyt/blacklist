import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FinalityToggle } from './finality-toggle';

describe('finality toggle', () => {
  it('links between the newest and the finalized read and says which is shown', () => {
    const { unmount } = render(<FinalityToggle href="/address/ethereum/0xabc" final={false} />);
    expect(screen.getByText(/newest data: fresh, but not yet final/u)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Show finalized data' }).getAttribute('href')).toBe(
      '/address/ethereum/0xabc?finality=final',
    );
    unmount();
    render(<FinalityToggle href="/address/ethereum/0xabc" final />);
    expect(screen.getByText(/finalized data: settled/u)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Show newest data' }).getAttribute('href')).toBe(
      '/address/ethereum/0xabc',
    );
  });
});
