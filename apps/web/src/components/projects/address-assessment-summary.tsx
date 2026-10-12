import type { PublicAssessment } from '@blacklist/contracts';
import { Confidence } from '@/components/app/confidence';
import { Notice } from '@/components/app/notice';
import { ProvenanceLabel } from '@/components/app/provenance-label';
import { RiskBadge } from '@/components/app/risk-badge';
import { formatDateTimeUtc } from '@/lib/format/date';
import { BAND_COPY, DISPUTE_COPY, FACTOR_WEIGHT_COPY } from '@/lib/risk/copy';

/**
 * Compact view of ONE address's own assessment: band, explanation, approved factors,
 * confidence, freshness and dispute state. No number (P-11). `null` means the
 * assessment could not be loaded, which is never shown as "not assessed" or as low.
 */
export function AddressAssessmentSummary({ assessment }: { readonly assessment: PublicAssessment | null }) {
  if (assessment === null) {
    return (
      <Notice tone="warning" title="Assessment unavailable right now">
        This address’s assessment could not be loaded. No result is shown instead of guessing. Try again
        later.
      </Notice>
    );
  }
  const dispute = DISPUTE_COPY[assessment.disputeState];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <RiskBadge band={assessment.band} />
        {dispute ? <span className="text-xs font-medium text-text">{dispute}</span> : null}
      </div>
      <p className="text-sm font-medium text-text">{BAND_COPY[assessment.band].summary}</p>
      <p className="text-sm text-muted">{assessment.explanation}</p>
      <dl className="grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-medium text-muted">Confidence</dt>
          <dd className="mt-0.5">
            <Confidence level={assessment.confidence} />
          </dd>
        </div>
        <div>
          <dt className="font-medium text-muted">As of</dt>
          <dd className="mt-0.5 text-text">
            <time dateTime={assessment.asOf}>{formatDateTimeUtc(assessment.asOf)}</time>
          </dd>
        </div>
      </dl>
      {assessment.factors.length > 0 ? (
        <div>
          <h4 className="mb-1.5 text-xs font-semibold text-text">Risk factors</h4>
          <ul className="flex flex-col gap-2">
            {assessment.factors.map((f) => (
              <li key={f.id} className="flex flex-col gap-1 rounded-md border border-border p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <ProvenanceLabel provenance={f.provenance} />
                  <span className="text-xs text-muted">{FACTOR_WEIGHT_COPY[f.weight]}</span>
                </div>
                <p className="text-sm text-text">{f.explanation}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-muted">No risk factors were found in the available data.</p>
      )}
    </div>
  );
}
