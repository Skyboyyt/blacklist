import type { PublicAssessment } from '@blacklist/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../../../test/a11y';
import { AssessmentPanel } from '../research/assessment-panel';
import { ProvenanceLabel } from './provenance-label';
import { RiskBadge } from './risk-badge';

const assessment: PublicAssessment = {
  band: 'severe',
  explanation: 'Moderators verified this contract drains token approvals.',
  factors: [
    {
      id: 'f1',
      code: 'finding.severe',
      explanation: 'Verified approval drainer.',
      provenance: 'moderator_finding',
      weight: 'primary',
      observedAt: '2026-09-15T10:00:00Z',
    },
    {
      id: 'f2',
      code: 'token.symbol_impersonation',
      explanation: 'Uses the symbol of a well-known asset.',
      provenance: 'platform_analysis',
      weight: 'contributing',
      observedAt: '2026-09-15T10:00:00Z',
    },
  ],
  confidence: 'high',
  coverage: 'Complete transaction history.',
  asOf: '2026-09-28T10:15:00Z',
  rulesetVersion: 'v1-demo',
  disputeState: 'under_appeal',
  suppressions: [],
};

describe('RiskBadge', () => {
  it.each([
    ['low', 'Low risk'],
    ['moderate', 'Moderate risk'],
    ['high', 'High risk'],
    ['severe', 'Severe risk'],
    ['not_assessed', 'Not assessed'],
  ] as const)('labels %s as "%s" with text, not colour alone', (band, label) => {
    render(<RiskBadge band={band} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('never shows a number or the word "safe"', () => {
    const { container } = render(
      <>
        <RiskBadge band="low" />
        <RiskBadge band="not_assessed" />
      </>,
    );
    expect(container.textContent).not.toMatch(/\d/);
    expect(container.textContent?.toLowerCase()).not.toContain('safe');
  });
});

describe('ProvenanceLabel', () => {
  it('uses the exact provenance terminology', () => {
    render(
      <>
        <ProvenanceLabel provenance="chain_fact" />
        <ProvenanceLabel provenance="community_allegation" showDescription />
        <ProvenanceLabel provenance="ai_observation" showDescription />
      </>,
    );
    expect(screen.getByText('Blockchain fact')).toBeInTheDocument();
    expect(screen.getByText('Community allegation')).toBeInTheDocument();
    expect(screen.getByText(/unverified claim/i)).toBeInTheDocument();
    expect(screen.getByText(/Never treated as fact/)).toBeInTheDocument();
  });
});

describe('AssessmentPanel', () => {
  it('shows band, explanation, factors with provenance, confidence, coverage, freshness and dispute state', () => {
    render(<AssessmentPanel assessment={assessment} />);
    expect(screen.getByText('Severe risk')).toBeInTheDocument();
    expect(screen.getByText(assessment.explanation)).toBeInTheDocument();
    expect(screen.getByText('Moderator finding')).toBeInTheDocument();
    expect(screen.getByText('Blacklist analysis')).toBeInTheDocument();
    expect(screen.getByText('Primary factor')).toBeInTheDocument();
    expect(screen.getByText('High confidence')).toBeInTheDocument();
    expect(screen.getByText(assessment.coverage)).toBeInTheDocument();
    expect(screen.getByText(/^28 Sept? 2026, 10:15 UTC$/)).toBeInTheDocument();
    expect(screen.getByText('Disputed — under appeal')).toBeInTheDocument();
  });

  it('never renders a numeric score', () => {
    const { container } = render(<AssessmentPanel assessment={assessment} />);
    expect(container.textContent).not.toMatch(/score/i);
    expect(container.textContent).not.toMatch(/\b\d{1,3}\s*(\/\s*100|%)/);
  });

  it('describes a low band without implying safety', () => {
    render(
      <AssessmentPanel assessment={{ ...assessment, band: 'low', factors: [], disputeState: 'none' }} />,
    );
    expect(
      screen.getByText(/No significant risk indicators found\. This is not a guarantee of safety\./),
    ).toBeInTheDocument();
  });

  it('shows the suspension wording', () => {
    render(<AssessmentPanel assessment={{ ...assessment, disputeState: 'suspended_pending_review' }} />);
    expect(screen.getByText('Temporarily suspended pending review')).toBeInTheDocument();
  });

  it('has no detectable accessibility violations', async () => {
    const { container } = render(<AssessmentPanel assessment={assessment} />);
    await expectNoAxeViolations(container);
  });
});
