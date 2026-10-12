import type { CaseSummary } from '@blacklist/contracts';
import Link from 'next/link';
import { ChainBadge } from '@/components/app/chain-badge';
import { Badge } from '@/components/ui/badge';
import { truncateMiddle } from '@/lib/format/address';
import { formatDateTimeUtc } from '@/lib/format/date';
import { CASE_TYPE_LABEL, CATEGORY_LABEL, STATUS_LABEL } from '@/lib/staff/copy';

function subjectLabel(c: CaseSummary): string {
  return c.subject.kind === 'address'
    ? truncateMiddle(c.subject.displayAddress, 8, 6)
    : `Project: ${c.subject.name}`;
}

/** Queue rows. Overdue deadlines are marked in text, not only colour. */
export function QueueList({ items, now }: { readonly items: readonly CaseSummary[]; readonly now: string }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((c) => {
        const overdue =
          c.slaDueAt < now &&
          ['queued', 'in_review', 'submitted', 'needs_info', 'screening'].includes(c.status);
        return (
          <li key={c.id}>
            <article
              aria-labelledby={`case-${c.id}`}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone="neutral">{CASE_TYPE_LABEL[c.type]}</Badge>
                  <span className="identifier text-muted">{c.id}</span>
                  {c.chain ? <ChainBadge chain={c.chain} /> : null}
                  {c.type === 'report_review' ? (
                    <span className="text-muted">{CATEGORY_LABEL[c.category]}</span>
                  ) : null}
                </div>
                <h3 id={`case-${c.id}`} className="font-medium text-text">
                  <Link href={`/mod/cases/${c.id}`} className="hover:underline">
                    {c.title}
                  </Link>
                </h3>
                <p className="identifier text-sm text-muted">{subjectLabel(c)}</p>
              </div>
              <div className="flex shrink-0 flex-col gap-1.5 text-sm sm:items-end">
                <Badge tone={c.status === 'needs_info' ? 'warning' : 'info'}>
                  {STATUS_LABEL[c.status] ?? c.status}
                </Badge>
                <span className="text-muted">
                  {c.assignedTo ? `Assigned to ${c.assignedTo.handle}` : 'Unassigned'}
                </span>
                <span className={overdue ? 'font-medium text-danger' : 'text-muted'}>
                  {overdue ? 'Overdue · ' : 'Due '}
                  <time dateTime={c.slaDueAt}>{formatDateTimeUtc(c.slaDueAt)}</time>
                </span>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
