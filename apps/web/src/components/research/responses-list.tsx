import type { SubjectResponse } from '@blacklist/contracts';
import { formatDateUtc } from '@/lib/format/date';
import { STANDING_LABEL } from '@/lib/projects/copy';

/**
 * Published right-of-reply responses (moderation §9). Shown as plain text. The wording
 * records time-bound control, not identity, and standing is not a claim that the
 * statement is true.
 */
export function ResponsesList({
  responses,
  subject,
}: {
  readonly responses: readonly SubjectResponse[];
  readonly subject: 'address' | 'project';
}) {
  return (
    <div className="flex flex-col gap-3">
      {responses.length === 0 ? (
        <p className="text-sm text-muted">No published responses.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {responses.map((r) => (
            <li key={r.id} className="flex flex-col gap-1.5 rounded-md border border-border p-3">
              <p className="text-sm break-words whitespace-pre-wrap text-text">{r.summary}</p>
              <p className="text-xs text-muted">
                Response from a party that proved{' '}
                {subject === 'address' ? 'control of this address' : 'standing for this project'} on{' '}
                <time dateTime={r.standingProvenAt}>{formatDateUtc(r.standingProvenAt)}</time> (
                {STANDING_LABEL[r.standing]}) · Published{' '}
                <time dateTime={r.publishedAt}>{formatDateUtc(r.publishedAt)}</time>
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">
        Responses are statements by a party with standing. Standing shows how the right to respond was
        established at that time, not who they are or that the statement is true.
      </p>
    </div>
  );
}
