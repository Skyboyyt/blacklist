import type { RiskConfidence } from '@blacklist/core';
import { cn } from '@/lib/cn';
import { CONFIDENCE_COPY } from '@/lib/risk/copy';

const filled: Record<RiskConfidence, number> = { low: 1, medium: 2, high: 3 };
const BAR_HEIGHTS = ['h-[7px]', 'h-[10px]', 'h-[13px]'] as const;

/** Confidence describes data completeness and freshness. It is independent of the band. */
export function Confidence({
  level,
  showDescription = false,
}: {
  readonly level: RiskConfidence;
  readonly showDescription?: boolean;
}) {
  const copy = CONFIDENCE_COPY[level];
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-2 text-sm font-medium text-text">
        <span className="flex items-end gap-0.5" aria-hidden="true">
          {BAR_HEIGHTS.map((height, index) => (
            <span
              key={height}
              className={cn('w-1.5 rounded-sm', height, index < filled[level] ? 'bg-text' : 'bg-surface-3')}
            />
          ))}
        </span>
        {copy.label}
      </span>
      {showDescription ? <span className="text-xs text-muted">{copy.description}</span> : null}
    </span>
  );
}
