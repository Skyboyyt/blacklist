import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../../../test/a11y';
import { CopyableValue } from '../app/copyable-value';
import { PRIMARY_NAV, STAFF_NAV } from '@/lib/nav/nav-items';
import { NavList } from './nav-list';
import { ThemeToggle } from './theme-toggle';

vi.mock('next/navigation', () => ({ usePathname: () => '/reports/new' }));

describe('ThemeToggle', () => {
  it('applies the chosen theme and reflects it with aria-pressed', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: 'System theme' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Dark theme' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByRole('button', { name: 'Dark theme' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'System theme' }));
    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });
});

describe('NavList', () => {
  it('marks the current section with aria-current', () => {
    render(<NavList sections={[PRIMARY_NAV, STAFF_NAV]} />);
    expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });

  it('has no detectable accessibility violations', async () => {
    const { container } = render(
      <nav aria-label="Main">
        <NavList sections={[PRIMARY_NAV]} />
      </nav>,
    );
    await expectNoAxeViolations(container);
  });
});

describe('CopyableValue', () => {
  const value = `0xb1ac${'0'.repeat(35)}4`;

  it('truncates visually but keeps the full value accessible and copyable', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(<CopyableValue value={value} kind="address" />);
    expect(screen.getByText('0xb1ac…0004')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText(value)).toHaveClass('sr-only');
    await user.click(screen.getByRole('button', { name: 'Copy address' }));
    expect(writeText).toHaveBeenCalledWith(value);
    expect(screen.getByRole('status')).toHaveTextContent('address copied');
  });
});
