import type { ChainFact } from '@blacklist/contracts';
import { Badge } from '@/components/ui/badge';
import { ProvenanceLabel } from '@/components/app/provenance-label';
import { formatDateTimeUtc } from '@/lib/format/date';

/**
 * Blockchain facts with source category, finality and each fact's own observation
 * time (which may differ from the assessment's "as of" time). Per-fact provider
 * attribution is added with the research refinement in Phase 3 (review P1-05).
 */
export function FactsList({ facts }: { readonly facts: readonly ChainFact[] }) {
  if (facts.length === 0) return <p className="text-sm text-muted">No blockchain facts available.</p>;
  return (
    <div className="flex flex-col gap-3">
      <ProvenanceLabel provenance="chain_fact" showDescription />
      <dl className="divide-y divide-border rounded-md border border-border">
        {facts.map((fact) => (
          <div
            key={fact.id}
            className="flex flex-col gap-1 p-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <dt className="text-sm text-muted">{fact.label}</dt>
            <dd className="flex flex-col gap-0.5 sm:items-end">
              <span className="flex items-center gap-2 text-sm font-medium text-text">
                {fact.value}
                {fact.finality !== 'final' ? <Badge tone="warning">Not final</Badge> : null}
              </span>
              <span className="text-xs text-muted">
                Observed <time dateTime={fact.observedAt}>{formatDateTimeUtc(fact.observedAt)}</time>
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
