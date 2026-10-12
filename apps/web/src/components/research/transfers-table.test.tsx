import type { Transfer } from '@blacklist/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TransfersTable } from './transfers-table';

const transfer: Transfer = {
  id: 't1',
  direction: 'in',
  counterparty: `0xb1ac${'0'.repeat(35)}3`,
  amount: '10,000',
  assetSymbol: 'USDC (Official)',
  assetVerified: false,
  evidenceLevel: 'asset_contract_log',
  authorization: 'unknown',
  tier: 'inferred',
  txHash: `0xb1ac${'0'.repeat(59)}1`,
  at: '2026-09-23T19:05:00Z',
};

describe('TransfersTable', () => {
  it('states that interaction is not wrongdoing', () => {
    render(<TransfersTable chain="ethereum" transfers={[transfer]} />);
    expect(screen.getByText(/does not mean wrongdoing/)).toBeInTheDocument();
  });

  it('uses plain language for unknown authorization and shows the evidence tier', () => {
    render(<TransfersTable chain="ethereum" transfers={[transfer]} />);
    expect(screen.getByText('Who authorized this transfer is unknown.')).toBeInTheDocument();
    expect(screen.getByText('Inferred')).toBeInTheDocument();
    expect(screen.getByText('Reported by the asset contract’s own log')).toBeInTheDocument();
  });

  it('never attributes authorization of an incoming transfer to the recipient (P1-03)', () => {
    render(
      <TransfersTable
        chain="ethereum"
        transfers={[
          { ...transfer, authorization: 'subject_signed_direct', evidenceLevel: 'native_consensus' },
        ]}
      />,
    );
    expect(screen.getByText('Signed directly by the sending address.')).toBeInTheDocument();
    expect(screen.getByText(/^Incoming transfer of/)).toBeInTheDocument();
    expect(screen.getByText('Sender')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/by this address|Received/);
  });

  it('reports an unvalidated log as a log claim, not as proof of movement', () => {
    render(
      <TransfersTable
        chain="ethereum"
        transfers={[{ ...transfer, direction: 'out', evidenceLevel: 'observed_log' }]}
      />,
    );
    expect(screen.getByText(/^A log reports an outgoing transfer of/)).toBeInTheDocument();
    expect(screen.getByText('Recipient')).toBeInTheDocument();
  });

  it('marks attacker-controlled token names as unverified', () => {
    render(<TransfersTable chain="ethereum" transfers={[transfer]} />);
    expect(screen.getByText('(unverified token name)')).toBeInTheDocument();
  });

  it('renders untrusted text as text, never as markup', () => {
    const { container } = render(
      <TransfersTable
        chain="ethereum"
        transfers={[{ ...transfer, assetSymbol: '<img src=x onerror=alert(1)>' }]}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  });

  it('describes a delegated outgoing transfer of a victim without implying wrongdoing (P1-03)', () => {
    render(
      <TransfersTable
        chain="ethereum"
        transfers={[
          {
            ...transfer,
            direction: 'out',
            authorization: 'delegated',
            evidenceLevel: 'balance_verified',
            assetSymbol: 'USDC',
            assetVerified: true,
            tier: 'verified',
          },
        ]}
      />,
    );
    expect(screen.getByText(/^Outgoing transfer of/)).toBeInTheDocument();
    expect(
      screen.getByText('Moved under an allowance or delegation granted by the sending address.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/does not mean wrongdoing/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/signed directly|stole|scam|drain/i);
  });

  it('reports a spoofed incoming log as a claim with unknown authorization (P1-03)', () => {
    render(
      <TransfersTable
        chain="ethereum"
        transfers={[{ ...transfer, direction: 'in', evidenceLevel: 'observed_log', assetSymbol: 'USDC' }]}
      />,
    );
    expect(screen.getByText(/^A log reports an incoming transfer of/)).toBeInTheDocument();
    expect(screen.getByText('Who authorized this transfer is unknown.')).toBeInTheDocument();
    expect(screen.getByText('(unverified token name)')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Received|Signed directly/);
  });
});
