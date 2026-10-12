import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PasswordInput } from './password-input';

describe('PasswordInput', () => {
  it('keeps password-manager friendly attributes and allows paste', async () => {
    const user = userEvent.setup();
    render(<PasswordInput id="pw" aria-label="Password" autoComplete="new-password" name="password" />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('autocomplete', 'new-password');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).not.toHaveAttribute('onpaste');
    input.focus();
    await user.paste('a pasted long passphrase');
    expect(input).toHaveValue('a pasted long passphrase');
  });

  it('shows a Caps Lock hint only while Caps Lock is on', () => {
    render(<PasswordInput id="pw" aria-label="Password" autoComplete="current-password" />);
    const input = screen.getByLabelText('Password');
    fireEvent.keyDown(input, { key: 'A', modifierCapsLock: true });
    expect(screen.getByText('Caps Lock is on')).toBeInTheDocument();
    fireEvent.keyUp(input, { key: 'a', modifierCapsLock: false });
    expect(screen.queryByText('Caps Lock is on')).toBeNull();
  });

  it('counts normalized code points for the requirement (emoji count once)', async () => {
    const user = userEvent.setup();
    render(<PasswordInput id="pw" aria-label="Password" autoComplete="new-password" showRequirement />);
    await user.type(screen.getByLabelText('Password'), '🔐🔐🔐');
    expect(screen.getByText('At least 15 characters (3/15)')).toBeInTheDocument();
  });
});
