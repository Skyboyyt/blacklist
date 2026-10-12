import { cn } from '@/lib/cn';

interface SpinnerProps {
  readonly size?: 'sm' | 'md' | 'lg';
  /** When set, the spinner is announced as a status; otherwise it is decorative. */
  readonly label?: string;
  readonly className?: string;
}

const sizes = { sm: 'size-4 border-2', md: 'size-6 border-2', lg: 'size-8 border-[3px]' } as const;

export function Spinner({ size = 'md', label, className }: SpinnerProps) {
  const ring = (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block animate-spin rounded-full border-current border-r-transparent motion-reduce:animate-none motion-reduce:border-r-current motion-reduce:opacity-60',
        sizes[size],
        className,
      )}
    />
  );
  if (!label) return ring;
  return (
    <span role="status" className="inline-flex items-center gap-2">
      {ring}
      <span className="sr-only">{label}</span>
    </span>
  );
}
