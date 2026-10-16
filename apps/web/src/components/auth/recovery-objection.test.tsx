import type { TokenFlowOutcome } from '@blacklist/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../../../test/a11y';
import { RecoveryObjection } from './recovery-objection';

const staffRecoveryObjection = vi.fn<(token: string, operation: string) => Promise<TokenFlowOutcome>>();
vi.mock('@/lib/api/browser', () => ({ getAuthApi: async () => ({ staffRecoveryObjection }) }));

function openAt(path: string) {
  window.history.replaceState(null, '', path);
}
beforeEach(() => staffRecoveryObjection.mockReset());

describe('recovery objection link (ADR 0013 C2)', () => {
  it('changes nothing on open, then records the objection and one withdrawal on explicit clicks', async () => {
    openAt('/recovery/object#token=demo-valid-token-0001');
    staffRecoveryObjection.mockResolvedValue({ kind: 'success' });
    const user = userEvent.setup();
    const { container } = render(<RecoveryObjection />);
    await screen.findByRole('button', { name: 'I did not ask for this: object' });
    expect(window.location.hash).toBe('');
    expect(staffRecoveryObjection).not.toHaveBeenCalled();
    await expectNoAxeViolations(container);

    await user.click(screen.getByRole('button', { name: 'I did not ask for this: object' }));
    expect(await screen.findByText('Objection recorded')).toBeInTheDocument();
    expect(staffRecoveryObjection).toHaveBeenLastCalledWith('demo-valid-token-0001', 'object');

    await user.click(screen.getByRole('button', { name: 'Withdraw my objection' }));
    expect(await screen.findByText('Objection withdrawn')).toBeInTheDocument();
    expect(staffRecoveryObjection).toHaveBeenLastCalledWith('demo-valid-token-0001', 'withdraw');
  });

  it('shows a used-link state when the server refuses the token', async () => {
    openAt('/recovery/object#token=demo-valid-token-0001');
    staffRecoveryObjection.mockResolvedValue({ kind: 'token_problem', status: 'used' });
    const user = userEvent.setup();
    render(<RecoveryObjection />);
    await user.click(await screen.findByRole('button', { name: 'I did not ask for this: object' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /object/ })).not.toBeInTheDocument());
  });
});
