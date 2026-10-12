import type { ScoreboardNotRankedReason, ScoreboardResponse } from '@blacklist/contracts';
import Link from 'next/link';
import { ChainBadge } from '@/components/app/chain-badge';
import { DataCard } from '@/components/app/data-card';
import { RiskBadge } from '@/components/app/risk-badge';
import { Badge } from '@/components/ui/badge';
import { truncateMiddle } from '@/lib/format/address';
import { formatDateTimeUtc, formatDateUtc } from '@/lib/format/date';
import { CATEGORY_LABEL } from '@/lib/projects/copy';
import { DISPUTE_COPY } from '@/lib/risk/copy';

export const NOT_RANKED_REASON: Readonly<Record<ScoreboardNotRankedReason, string>> = {
  stale_profile: 'Profile not re-reviewed recently, so the result may be out of date',
  assessment_unavailable: 'An official address’s assessment could not be loaded',
  suspended_finding: 'A finding is temporarily suspended pending review',
  not_assessed: 'No official address has enough data to be assessed',
  low_confidence: 'The available data is too limited for a reliable band',
  no_official_addresses: 'No official addresses are listed yet',
};

/**
 * Band ranking of reviewed projects (ADR 0012). Higher rank means more risk found. There
 * is no score: projects in the same band share a rank and are listed A–Z. Projects
 * without reliable data are listed separately, never ranked as low risk.
 */
export function ScoreboardView({ data }: { readonly data: ScoreboardResponse }) {
  return (
    <div className="flex flex-col gap-6">
      <DataCard title={`Ranked projects (${data.ranked.length})`}>
        {data.ranked.length === 0 ? (
          <p className="text-sm text-muted">
            No project has enough reliable data to be ranked for this selection.
          </p>
        ) : (
          <ol className="flex flex-col divide-y divide-border">
            {data.ranked.map((e) => {
              const dispute = DISPUTE_COPY[e.disputeState];
              return (
                <li
                  key={e.slug}
                  className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[3rem_minmax(0,1fr)_auto]"
                >
                  <p className="row-span-2 text-lg font-semibold text-text tabular-nums">
                    <span className="sr-only">Rank </span>
                    {e.rank}
                    {e.tied ? (
                      <>
                        <span aria-hidden="true">=</span>
                        <span className="sr-only"> (shared)</span>
                      </>
                    ) : null}
                  </p>
                  <div className="min-w-0">
                    <Link
                      href={`/project/${e.slug}`}
                      className="font-medium break-words text-text hover:underline"
                    >
                      {e.name}
                    </Link>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span>{CATEGORY_LABEL[e.category]}</span>
                      {e.networks.map((n) => (
                        <ChainBadge key={n} chain={n} />
                      ))}
                      {e.freshness === 'partial' ? <Badge tone="warning">Partial data</Badge> : null}
                      {dispute ? <Badge tone="info">{dispute}</Badge> : null}
                    </p>
                  </div>
                  <div className="col-start-2 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:self-center">
                    <RiskBadge band={e.band} />
                  </div>
                  <p className="col-start-2 text-xs text-muted">
                    Set by{' '}
                    <Link
                      href={`/address/${e.decidingAddress.chain}/${e.decidingAddress.address}`}
                      className="identifier text-accent hover:underline"
                      title={e.decidingAddress.displayAddress}
                    >
                      {truncateMiddle(e.decidingAddress.displayAddress, 8, 6)}
                    </Link>{' '}
                    · {e.basedOn.assessed} of {e.basedOn.total} official addresses assessed · reviewed{' '}
                    {formatDateUtc(e.lastReviewedAt)}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
        {data.asOf ? (
          <p className="mt-4 text-xs text-muted">
            Assessments as of <time dateTime={data.asOf}>{formatDateTimeUtc(data.asOf)}</time>.
          </p>
        ) : null}
      </DataCard>

      <DataCard
        title={`Not ranked (${data.notRanked.length})`}
        description="Missing or unreliable data is never ranked as low risk."
      >
        {data.notRanked.length === 0 ? (
          <p className="text-sm text-muted">Every project in this selection could be ranked.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.notRanked.map((p) => (
              <li
                key={p.slug}
                className="flex flex-col gap-0.5 text-sm sm:flex-row sm:justify-between sm:gap-4"
              >
                <Link
                  href={`/project/${p.slug}`}
                  className="font-medium break-words text-text hover:underline"
                >
                  {p.name}
                </Link>
                <span className="text-muted">{NOT_RANKED_REASON[p.reason]}</span>
              </li>
            ))}
          </ul>
        )}
      </DataCard>
    </div>
  );
}
