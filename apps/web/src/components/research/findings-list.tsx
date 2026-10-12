import type { FindingSummary } from '@blacklist/contracts';
import { ProvenanceLabel } from '@/components/app/provenance-label';
import { Badge } from '@/components/ui/badge';
import { formatDateUtc } from '@/lib/format/date';
import { DISPUTE_COPY } from '@/lib/risk/copy';

/** Published findings. Disputed findings stay visible with their dispute state. */
export function FindingsList({ findings }: { readonly findings: readonly FindingSummary[] }) {
  if (findings.length === 0) return <p className="text-sm text-muted">No published findings.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {findings.map((f) => {
        const dispute = DISPUTE_COPY[f.disputeState];
        return (
          <li key={f.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <ProvenanceLabel provenance={f.provenance} />
              {dispute ? (
                <Badge tone={f.disputeState === 'under_appeal' ? 'info' : 'warning'}>{dispute}</Badge>
              ) : null}
            </div>
            <p className="font-medium text-text">{f.title}</p>
            <p className="text-sm text-muted">{f.summary}</p>
            <p className="text-xs text-muted">
              Published <time dateTime={f.publishedAt}>{formatDateUtc(f.publishedAt)}</time>
            </p>
          </li>
        );
      })}
    </ul>
  );
}
