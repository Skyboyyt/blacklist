import type { AddressResearch, Disclosure } from '@blacklist/contracts';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../../../test/a11y';
import { ADDRESS_FIXTURES } from '@/lib/api/mock/fixtures/addresses';
import { EVM, SOLANA } from '@/lib/api/mock/fixtures/ids';
import { AddressResearchView } from './address-research-view';
import { AssessmentPanel } from './assessment-panel';
import { DisclosuresList } from './disclosures-list';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/' }));

const at = '2026-09-28T10:15:00Z';
const disclosures: Disclosure[] = [
  {
    id: 'd1',
    code: 'upgradeable_proxy',
    label: 'Upgrade authority present',
    explanation: 'Owner can replace logic.',
    provenance: 'chain_fact',
    source: 'Finalized node read',
    observedAt: at,
  },
  {
    id: 'd2',
    code: 'pause_authority',
    label: 'Pause authority present',
    explanation: 'Owner can pause.',
    provenance: 'chain_fact',
    source: 'Finalized node read',
    observedAt: at,
  },
  {
    id: 'd3',
    code: 'mint_authority',
    label: 'Mint authority active',
    explanation: 'Can mint.',
    provenance: 'chain_fact',
    source: 'Finalized node read',
    observedAt: at,
  },
  {
    id: 'd4',
    code: 'unverified_source',
    label: 'Source code not verified',
    explanation: 'Not published.',
    provenance: 'external_source',
    source: 'Block explorer verification record',
    observedAt: at,
  },
];

const fixture = (address: string): AddressResearch => {
  const found = ADDRESS_FIXTURES.find((f) => f.address === address);
  if (!found) throw new Error('fixture missing');
  return found;
};

describe('DisclosuresList (P1-01)', () => {
  it('presents each capability as a neutral disclosure with no effect on the assessment', () => {
    const { container } = render(<DisclosuresList disclosures={disclosures} />);
    for (const d of disclosures) expect(screen.getByText(d.label)).toBeInTheDocument();
    expect(screen.getAllByText('Disclosure')).toHaveLength(disclosures.length);
    expect(screen.getAllByText(/No effect on the assessment/)).toHaveLength(disclosures.length);
    expect(screen.getByText(/do not affect the risk assessment/)).toBeInTheDocument();
    // Not styled or worded as risk: no band, no factor weight, no alert.
    expect(container.querySelector('[data-band]')).toBeNull();
    expect(container.textContent).not.toMatch(/Primary factor|Contributing factor|Minor factor|risk factor/i);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('has no detectable accessibility violations', async () => {
    const { container } = render(<DisclosuresList disclosures={disclosures} />);
    await expectNoAxeViolations(container);
  });
});

describe('fixture semantics (P1-01)', () => {
  it('upgrade and pause authority and unverified source are shown without raising the band', () => {
    const data = fixture(EVM.contractWithDisclosures);
    expect(data.disclosures.map((d) => d.code).sort()).toEqual([
      'pause_authority',
      'unverified_source',
      'upgradeable_proxy',
    ]);
    expect(data.assessment.band).toBe('low');
    expect(data.assessment.factors).toEqual([]);
  });

  it('mint authority is a disclosure; the Moderate band rests only on an approved factor', () => {
    const data = fixture(SOLANA.lookalikeToken);
    expect(data.disclosures.map((d) => d.code)).toEqual(['mint_authority']);
    expect(data.assessment.factors.map((f) => f.code)).toEqual(['token.symbol_impersonation']);
  });

  it('no assessment explanation or factor claims a capability caused the band', () => {
    for (const data of ADDRESS_FIXTURES) {
      const text = [data.assessment.explanation, ...data.assessment.factors.map((f) => f.explanation)]
        .join(' ')
        .toLowerCase();
      expect(text).not.toMatch(
        /(can|could) (be )?(pause|upgrade|mint)|mint authority|not verified|unverified source/,
      );
    }
  });

  it('the assessment panel shows factors only, never disclosures', () => {
    const data = fixture(EVM.contractWithDisclosures);
    render(<AssessmentPanel assessment={data.assessment} />);
    const panel = screen.getByRole('region', { name: 'Risk assessment' });
    expect(within(panel).queryByText('Upgrade authority present')).toBeNull();
    expect(within(panel).getByText('No risk factors were found in the available data.')).toBeInTheDocument();
  });

  it('the research page lists disclosures in their own section, separate from the assessment', () => {
    render(<AddressResearchView data={fixture(EVM.contractWithDisclosures)} />);
    const section = screen.getByRole('region', { name: 'Disclosures' });
    expect(within(section).getByText('Upgrade authority present')).toBeInTheDocument();
    expect(within(section).getByText('Pause authority present')).toBeInTheDocument();
    expect(within(section).getByText('Source code not verified')).toBeInTheDocument();
    expect(screen.getByText('Low risk')).toBeInTheDocument();
  });
});
