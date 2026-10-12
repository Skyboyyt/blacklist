import type { TimelineEvent } from '@blacklist/contracts';
import { formatDateTimeUtc } from '@/lib/format/date';

const ACTOR_LABEL: Record<TimelineEvent['actor'], string> = {
  system: 'System',
  moderator: 'Moderator',
  subject: 'Subject',
};

/** Ordered history of public status changes (shell: wording only, no internal detail). */
export function StatusTimeline({ events }: { readonly events: readonly TimelineEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-muted">No public status changes.</p>;
  return (
    <ol className="relative flex flex-col gap-4 border-l border-border pl-5">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span
            aria-hidden="true"
            className="absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full border-2 border-surface bg-border-strong"
          />
          <p className="text-sm font-medium text-text">{e.label}</p>
          <p className="text-xs text-muted">
            <time dateTime={e.at}>{formatDateTimeUtc(e.at)}</time> · {ACTOR_LABEL[e.actor]}
          </p>
        </li>
      ))}
    </ol>
  );
}
