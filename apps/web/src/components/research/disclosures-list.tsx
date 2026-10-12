import type { Disclosure } from '@blacklist/contracts';
import { ProvenanceLabel } from '@/components/app/provenance-label';
import { Icon } from '@/components/ui/icon';
import { formatDateTimeUtc } from '@/lib/format/date';
import { DISCLOSURE_COPY } from '@/lib/risk/copy';

/**
 * Capability disclosures (mint/pause/upgrade authority, unverified source …).
 * Deliberately neutral: no risk colours, no warning icons, no weights. They have
 * zero contribution to the V1 assessment and never appear among its factors.
 */
export function DisclosuresList({ disclosures }: { readonly disclosures: readonly Disclosure[] }) {
  if (disclosures.length === 0) return <p className="text-sm text-muted">No capability disclosures.</p>;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{DISCLOSURE_COPY.description}</p>
      <ul className="flex flex-col gap-2">
        {disclosures.map((d) => (
          <li
            key={d.id}
            data-disclosure={d.code}
            className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-2 p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded border border-border-strong bg-surface px-1.5 py-0.5 text-[0.7rem] font-semibold tracking-wide text-muted uppercase">
                <Icon name="info" className="size-3" />
                {DISCLOSURE_COPY.label}
              </span>
              <ProvenanceLabel provenance={d.provenance} />
            </div>
            <p className="text-sm font-medium text-text">{d.label}</p>
            <p className="text-sm text-muted">{d.explanation}</p>
            <p className="text-xs text-muted">
              Observed <time dateTime={d.observedAt}>{formatDateTimeUtc(d.observedAt)}</time> · Source:{' '}
              {d.source} · No effect on the assessment
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
