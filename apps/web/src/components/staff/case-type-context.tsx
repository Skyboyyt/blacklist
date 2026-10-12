import type { CaseDetail } from '@blacklist/contracts';
import { Badge } from '@/components/ui/badge';
import { formatDateTimeUtc, formatDateUtc } from '@/lib/format/date';
import { SEVERITY_LABEL } from '@/lib/staff/copy';

type Response = Extract<CaseDetail, { type: 'subject_response' }>;
type SuspensionReview = Extract<CaseDetail, { type: 'suspension_review' }>;

export const STANDING_MECHANISM_LABEL = {
  signature: 'Fresh wallet signature',
  authority_signature: 'Authority signature',
  dns_txt: 'DNS record',
  documentary: 'Staff-reviewed documents',
} as const;

/**
 * A right-of-reply response under safety moderation (moderation §9). The body is shown
 * as plain text exactly as it would be published.
 */
export function ResponseContext({ response }: { readonly response: Response }) {
  const s = response.standing;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        Check for personal data, abuse and malicious links. Moderation is for safety, not viewpoint.
      </p>
      <p className="rounded-md border border-border p-3 text-sm break-words whitespace-pre-wrap text-text">
        {response.body}
      </p>
      <p className="text-xs text-muted">
        Standing: {STANDING_MECHANISM_LABEL[s.mechanism]},{' '}
        <span className={s.outcome === 'pending' ? 'font-medium text-warning' : 'font-medium text-text'}>
          {s.outcome === 'pending' ? 'waiting for a standing decision' : s.outcome}
        </span>
        . {s.scopeStatement}
      </p>
    </div>
  );
}

/**
 * Review of an emergency suspension (moderation §8.3). A non-participant reinstates or
 * reverses within 72 hours; a severe finding cannot be reversed by the person who
 * suspended it.
 */
export function SuspensionContext({ review }: { readonly review: SuspensionReview }) {
  const f = review.suspendedFinding;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section
        aria-labelledby="suspended-finding"
        className="flex flex-col gap-2 rounded-md border border-border p-3"
      >
        <h3 id="suspended-finding" className="text-sm font-semibold text-text">
          Suspended finding
        </h3>
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="identifier">{f.findingId}</span>
          <Badge tone={f.severity === 'severe' || f.severity === 'high' ? 'danger' : 'warning'}>
            {SEVERITY_LABEL[f.severity]}
          </Badge>
        </p>
        <p className="text-sm text-text">{f.publicSummary}</p>
        <p className="text-xs text-muted">
          Author {f.author.handle} · approved by {f.approver.handle} · published{' '}
          {formatDateUtc(f.publishedAt)}. They took part in this finding, so they cannot review the
          suspension.
        </p>
      </section>
      <section
        aria-labelledby="suspension-reason"
        className="flex flex-col gap-2 rounded-md border border-border p-3"
      >
        <h3 id="suspension-reason" className="text-sm font-semibold text-text">
          Why it was suspended
        </h3>
        <p className="text-sm whitespace-pre-wrap text-text">{review.suspensionReason}</p>
        <p className="text-xs text-muted">
          Suspended by {review.suspendedBy.handle}. Review due by{' '}
          <time dateTime={review.slaDueAt}>{formatDateTimeUtc(review.slaDueAt)}</time>. While suspended the
          public page shows only “Temporarily suspended pending review” and the finding does not count.
        </p>
      </section>
    </div>
  );
}
