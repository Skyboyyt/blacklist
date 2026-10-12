import type { StaffAssessment } from '@blacklist/contracts';
import { Notice } from '@/components/app/notice';
import { RiskBadge } from '@/components/app/risk-badge';
import { DisclosuresList } from '@/components/research/disclosures-list';

const FACTOR_LABEL: Record<string, string> = {
  'finding.severe': 'Published severe finding',
  'finding.high': 'Published high finding',
  'finding.medium': 'Published medium finding',
  'finding.low': 'Published low finding',
  'token.symbol_impersonation': 'Token symbol impersonation',
  'eoa.delegated_to_flagged': 'Delegated to a contract with a published finding',
};

/**
 * Staff-only assessment. The number follows the §15.3 calibration PROPOSAL (O-12 not
 * signed off) and is labelled as such. Unscored subjects show why; they are never 0.
 * Disclosures sit apart with zero contribution. Public pages never show the number.
 */
export function StaffAssessmentPanel({ assessment }: { readonly assessment: StaffAssessment | null }) {
  if (assessment === null) {
    return (
      <p className="text-sm text-muted">
        Project profiles have no combined assessment. Each official address is assessed on its own.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Notice tone="warning" title="Staff only: calibration proposal">
        Scores use the proposed V1 contribution table, which the owner has not signed off (O-12). They are
        never shown publicly; public pages show the band and explanation only.
      </Notice>
      {assessment.kind === 'unscored' ? (
        <div className="flex flex-col gap-2">
          <RiskBadge band="not_assessed" className="w-fit" />
          <p className="text-sm font-medium text-text">Unscored</p>
          <p className="text-sm text-muted">{assessment.reason}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <RiskBadge band={assessment.band} size="lg" />
            <p className="text-sm text-text">
              Staff score <span className="text-xl font-semibold tabular-nums">{assessment.score}</span> of
              100
            </p>
          </div>
          <p className="text-xs text-muted">
            Sum of contributions, capped at {assessment.ceiling}
            {assessment.ceiling === 74
              ? ' (no published severe finding)'
              : ' (a published severe finding applies)'}
            . Ruleset {assessment.rulesetVersion}.
          </p>
          {assessment.contributions.length === 0 ? (
            <p className="text-sm text-muted">
              No risk factors apply, so the score is 0. This is a computed result.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {assessment.contributions.map((c) => (
                <li key={c.factorCode} className="flex flex-col gap-1 rounded-md border border-border p-3">
                  <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium text-text">{FACTOR_LABEL[c.factorCode]}</span>
                    <span className="tabular-nums text-text">+{c.contribution}</span>
                  </p>
                  <p className="text-sm text-muted">{c.explanation}</p>
                  <p className="text-xs text-muted">
                    Supporting records: <span className="identifier">{c.evidenceRefs.join(', ')}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-text">Capability disclosures (no contribution)</h3>
        <DisclosuresList disclosures={assessment.disclosures} />
      </div>
    </div>
  );
}
