import type { PublicLabel } from '@blacklist/contracts';
import { ProvenanceLabel } from '@/components/app/provenance-label';
import { formatDateUtc } from '@/lib/format/date';

/** Staff-managed labels that identify an address. They are not risk factors and do not change the band. */
export function LabelsList({ labels }: { readonly labels: readonly PublicLabel[] }) {
  if (labels.length === 0) return <p className="text-sm text-muted">No public labels.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {labels.map((l) => (
        <li key={l.id} className="flex flex-col gap-1 rounded-md border border-border p-3">
          <p className="text-sm font-medium break-words text-text">{l.text}</p>
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <ProvenanceLabel provenance={l.provenance} />
            {l.sourceName ? <span>Source: {l.sourceName}</span> : null}
            <span>
              Added <time dateTime={l.addedAt}>{formatDateUtc(l.addedAt)}</time>
            </span>
          </p>
        </li>
      ))}
    </ul>
  );
}
