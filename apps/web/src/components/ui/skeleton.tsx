import { cn } from '@/lib/cn';

/** Placeholder block while content loads. Decorative: pair it with a status message. */
export function Skeleton({ className }: { readonly className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('block animate-pulse rounded-md bg-surface-3 motion-reduce:animate-none', className)}
    />
  );
}
