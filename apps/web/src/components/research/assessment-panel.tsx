import type { PublicAssessment } from '@blacklist/contracts';
import { Confidence } from '@/components/app/confidence';
import { DataCard } from '@/components/app/data-card';
import { Notice } from '@/components/app/notice';
import { ProvenanceLabel } from '@/components/app/provenance-label';
import { RiskBadge } from '@/components/app/risk-badge';
import { formatDateTimeUtc } from '@/lib/format/date';
import { BAND_COPY, DISPUTE_COPY, FACTOR_WEIGHT_COPY, SUPPRESSIBLE_FACTOR_LABEL } from '@/lib/risk/copy';

/**
 * Public risk assessment: band + explanation + factors + confidence + coverage +
 * freshness + dispute state. No numeric score (decision P-11).
 */
export function AssessmentPanel({ assessment }: { readonly assessment: PublicAssessment }) {
  const dispute = DISPUTE_COPY[assessment.disputeState];
  return (
    <DataCard id="assessment" title="Risk assessment" className="flex flex-col">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <RiskBadge band={assessment.band} size="lg" className="w-fit" />
          <p className="text-sm font-medium text-text">{BAND_COPY[assessment.band].summary}</p>
          <p className="text-sm text-muted">{assessment.explanation}</p>
        </div>

        {dispute ? (
          <Notice
            tone={assessment.disputeState === 'suspended_pending_review' ? 'warning' : 'info'}
            title={dispute}
          >
            {assessment.disputeState === 'under_appeal'
              ? 'An appeal has been filed. The finding stays visible while it is reviewed independently.'
              : 'A finding has been removed from this assessment while it is reviewed.'}
          </Notice>
        ) : null}

        <dl className="grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-muted">Confidence</dt>
            <dd className="mt-1">
              <Confidence level={assessment.confidence} showDescription />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Data coverage</dt>
            <dd className="mt-1 text-text">{assessment.coverage}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">As of</dt>
            <dd className="mt-1 text-text">
              <time dateTime={assessment.asOf}>{formatDateTimeUtc(assessment.asOf)}</time>
              <span className="block text-xs text-muted">Ruleset {assessment.rulesetVersion}</span>
            </dd>
          </div>
        </dl>

        <div className="border-t border-border pt-4">
          <h3 className="mb-2 text-sm font-semibold text-text">Key factors</h3>
          {assessment.factors.length === 0 ? (
            <p className="text-sm text-muted">No risk factors were found in the available data.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {assessment.factors.map((f) => (
                <li key={f.id} className="flex flex-col gap-1.5 rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <ProvenanceLabel provenance={f.provenance} />
                    <span className="text-xs text-muted">{FACTOR_WEIGHT_COPY[f.weight]}</span>
                  </div>
                  <p className="text-sm text-text">{f.explanation}</p>
                  <p className="text-xs text-muted">
                    Observed <time dateTime={f.observedAt}>{formatDateTimeUtc(f.observedAt)}</time>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {assessment.suppressions.length > 0 ? (
          <div className="border-t border-border pt-4">
            <h3 className="mb-2 text-sm font-semibold text-text">Suppressed indicators</h3>
            <ul className="flex flex-col gap-2">
              {assessment.suppressions.map((s) => (
                <li key={`${s.factorCode}-${s.at}`} className="rounded-md border border-border p-3 text-sm">
                  <p className="text-text">
                    {SUPPRESSIBLE_FACTOR_LABEL[s.factorCode]}: suppressed by staff and not counted.
                  </p>
                  <p className="break-words text-muted">Reason: {s.publicReason}</p>
                  <p className="text-xs text-muted">
                    <time dateTime={s.at}>{formatDateTimeUtc(s.at)}</time>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </DataCard>
  );
}
