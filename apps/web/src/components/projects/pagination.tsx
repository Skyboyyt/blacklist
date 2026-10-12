import Link from 'next/link';
import { Icon } from '@/components/ui/icon';

interface PaginationProps {
  readonly page: number;
  readonly totalPages: number;
  readonly hrefFor: (page: number) => string;
}

/** Previous / next pagination with the current position announced. Links, so it works without JavaScript. */
export function Pagination({ page, totalPages, hrefFor }: PaginationProps) {
  if (totalPages <= 1) return null;
  const linkClass =
    'inline-flex h-10 items-center gap-1 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text hover:border-border-strong';
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={linkClass} rel="prev">
          <Icon name="chevronRight" className="size-4 rotate-180" />
          Previous page
        </Link>
      ) : (
        <span />
      )}
      <p className="text-sm text-muted">
        Page {page} of {totalPages}
      </p>
      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} className={linkClass} rel="next">
          Next page
          <Icon name="chevronRight" className="size-4" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
