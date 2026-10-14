import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { addressResearchSchema } from '@blacklist/contracts';
import { AddressResearchView } from './address-research-view';
const data = addressResearchSchema.parse({
  chain: 'ethereum',
  address: '0x' + '1'.repeat(40),
  displayAddress: '0x' + '1'.repeat(40),
  kind: 'wallet',
  untrustedLabel: null,
  availability: {
    assessment: 'unavailable',
    findings: 'unavailable',
    labels: 'unavailable',
    responses: 'unavailable',
    transfers: 'unavailable',
    evidence: 'unavailable',
    history: 'unavailable',
    disclosures: 'unavailable',
  },
  assessment: {
    band: 'not_assessed',
    explanation: 'Unavailable',
    factors: [],
    confidence: 'low',
    coverage: 'Unavailable',
    asOf: '2026-10-01T00:00:00Z',
    rulesetVersion: 'unavailable',
    disputeState: 'none',
    suppressions: [],
  },
  facts: [],
  disclosures: [],
  labels: [],
  findings: [],
  responses: [],
  transfers: [],
  evidence: [],
  timeline: [],
});
describe('live research does not turn absent backends into reassuring empty results', () => {
  it('shows unavailable sections rather than zero findings or invented assessment', () => {
    render(<AddressResearchView data={data} />);
    expect(screen.getByText(/Risk assessment is unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/Published finding data is unavailable/)).toBeInTheDocument();
    expect(screen.queryByText('Findings (0)')).not.toBeInTheDocument();
    expect(screen.queryByText('No risk factors were found in the available data.')).not.toBeInTheDocument();
    expect(screen.queryByText(/Ruleset unavailable/)).not.toBeInTheDocument();
  });
});
