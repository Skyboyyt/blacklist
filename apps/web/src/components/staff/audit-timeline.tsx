import type { AuditEntry } from '@blacklist/contracts';
import Link from 'next/link';
import { formatDateTimeUtc } from '@/lib/format/date';
import { AUDIT_ACTION_LABEL } from '@/lib/staff/copy';

/** Audit entries: actor, action, time, internal reason and field changes. */
export function AuditTimeline({
  entries,
  showCase = false,
}: {
  readonly entries: readonly AuditEntry[];
  readonly showCase?: boolean;
}) {
  if (entries.length === 0) return <p className="text-sm text-muted">No recorded actions.</p>;
  return (
    <ol className="flex flex-col gap-3">
      {entries.map((e) => (
        <li key={e.id} className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium text-text">{AUDIT_ACTION_LABEL[e.action]}</span>
            <span className="text-muted">by {e.actor === 'system' ? 'System' : e.actor.handle}</span>
            <time className="text-xs text-muted" dateTime={e.at}>
              {formatDateTimeUtc(e.at)}
            </time>
            {showCase && e.caseId ? (
              <Link
                href={`/mod/cases/${e.caseId}`}
                className="identifier text-xs text-accent hover:underline"
              >
                {e.caseId}
              </Link>
            ) : null}
          </p>
          {e.reason ? (
            <p className="text-muted">
              <span className="text-xs font-semibold tracking-wide uppercase">Internal reason</span>{' '}
              {e.reason}
            </p>
          ) : null}
          {e.changes.length > 0 ? (
            <ul className="text-xs text-muted">
              {e.changes.map((c, i) => (
                <li key={i}>
                  {c.field}: {c.from ?? '—'} → {c.to ?? '—'}
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
