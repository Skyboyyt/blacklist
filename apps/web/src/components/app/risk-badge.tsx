import type { AssessmentBand } from '@blacklist/core';
import { cn } from '@/lib/cn';
import { BAND_COPY } from '@/lib/risk/copy';

const styles: Record<AssessmentBand, string> = {
  low: 'bg-risk-low-soft text-risk-low border-risk-low/40',
  moderate: 'bg-risk-moderate-soft text-risk-moderate border-risk-moderate/40',
  high: 'bg-risk-high-soft text-risk-high border-risk-high/50',
  severe: 'bg-risk-severe-soft text-risk-severe border-risk-severe/60',
  not_assessed: 'bg-risk-na-soft text-risk-na border-risk-na/50 border-dashed',
};

/** Distinct shapes so the band never depends on colour alone. */
function BandGlyph({ band }: { readonly band: AssessmentBand }) {
  const common = { viewBox: '0 0 16 16', className: 'size-3.5 shrink-0', 'aria-hidden': true } as const;
  switch (band) {
    case 'low':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case 'moderate':
      return (
        <svg {...common}>
          <path d="M8 3a5 5 0 0 1 0 10z" fill="currentColor" />
          <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case 'high':
      return (
        <svg {...common}>
          <path d="M8 2 14 13H2z" fill="currentColor" />
        </svg>
      );
    case 'severe':
      return (
        <svg {...common}>
          <path d="M5 1h6l4 4v6l-4 4H5l-4-4V5z" fill="currentColor" />
          <path d="M8 4.5v4M8 11v.5" stroke="var(--surface)" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'not_assessed':
      return (
        <svg {...common}>
          <circle
            cx="8"
            cy="8"
            r="5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="2.5 2"
          />
        </svg>
      );
  }
}

interface RiskBadgeProps {
  readonly band: AssessmentBand;
  readonly size?: 'sm' | 'lg';
  readonly className?: string;
}

/**
 * Public risk band. Shows the band name only — never the numeric Risk Score
 * (decision P-11). "Low" is never worded as "safe".
 */
export function RiskBadge({ band, size = 'sm', className }: RiskBadgeProps) {
  const label = band === 'not_assessed' ? BAND_COPY[band].label : `${BAND_COPY[band].label} risk`;
  return (
    <span
      data-band={band}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap',
        size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs',
        styles[band],
        className,
      )}
    >
      <BandGlyph band={band} />
      {label}
    </span>
  );
}
