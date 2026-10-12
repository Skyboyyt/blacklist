import type { SecurityEvent } from '@blacklist/contracts';
import { formatDateTimeUtc } from '@/lib/format/date';
import { SECURITY_EVENT_LABEL } from '@/lib/security/security-event-copy';

/**
 * Recent security activity for the account holder only. Coarse device summaries,
 * no IP addresses, locations or internal identifiers.
 */
export function SecurityActivity({ events }: { readonly events: readonly SecurityEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-muted">No recent security activity.</p>;
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-border">
        {events.map((e) => (
          <li
            key={e.id}
            className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
          >
            <span className="text-sm font-medium text-text">{SECURITY_EVENT_LABEL[e.kind]}</span>
            <span className="text-xs text-muted">
              <time dateTime={e.at}>{formatDateTimeUtc(e.at)}</time>
              {e.deviceSummary ? ` · ${e.deviceSummary}` : ''}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        Don’t recognize something? Change your password and sign out your other sessions.
      </p>
    </div>
  );
}
