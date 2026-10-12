import type { Provenance } from '@blacklist/core';
import { cn } from '@/lib/cn';
import { PROVENANCE_COPY } from '@/lib/risk/copy';

/**
 * Where a claim comes from. Every fact, factor and finding carries one, so a
 * blockchain fact is never confused with an allegation or an AI observation.
 */
const styles: Record<Provenance, string> = {
  chain_fact: 'border-border-strong bg-surface text-text',
  platform_analysis: 'border-info/40 bg-info-soft text-info',
  community_allegation: 'border-warning/50 bg-warning-soft text-warning border-dashed',
  moderator_finding: 'border-accent/40 bg-accent-soft text-accent',
  ai_observation: 'border-border-strong bg-surface-2 text-muted border-dashed',
  external_source: 'border-border-strong bg-surface-2 text-text',
};

interface ProvenanceLabelProps {
  readonly provenance: Provenance;
  /** Also render the one-line definition (use on first mention or in legends). */
  readonly showDescription?: boolean;
}

export function ProvenanceLabel({ provenance, showDescription = false }: ProvenanceLabelProps) {
  const copy = PROVENANCE_COPY[provenance];
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span
        data-provenance={provenance}
        className={cn(
          'inline-flex w-fit items-center rounded border px-1.5 py-0.5 text-[0.7rem] font-semibold tracking-wide uppercase',
          styles[provenance],
        )}
      >
        <span className="sr-only">Source: </span>
        {copy.label}
      </span>
      {showDescription ? <span className="text-xs text-muted">{copy.description}</span> : null}
    </span>
  );
}
