import type { CaseDetail } from '@blacklist/contracts';
import { Badge } from '@/components/ui/badge';
import { formatDateUtc } from '@/lib/format/date';
import { SEVERITY_LABEL } from '@/lib/staff/copy';
import { STANDING_MECHANISM_LABEL as MECHANISM } from './case-type-context';

type Appeal = Extract<CaseDetail, { type: 'appeal_review' }>;

/** The decision under appeal, the appellant's grounds and the standing decision. */
export function AppealContext({ appeal }: { readonly appeal: Appeal }) {
  const d = appeal.appealedDecision;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section
        aria-labelledby="original-decision"
        className="flex flex-col gap-2 rounded-md border border-border p-3"
      >
        <h3 id="original-decision" className="text-sm font-semibold text-text">
          Original decision
        </h3>
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="identifier">
            {d.findingId} · revision {d.revisionNumber}
          </span>
          <Badge tone={d.severity === 'severe' || d.severity === 'high' ? 'danger' : 'warning'}>
            {SEVERITY_LABEL[d.severity]}
          </Badge>
        </p>
        <p className="text-sm text-text">{d.publicSummary}</p>
        <p className="text-xs text-muted">
          Author {d.author.handle} · approved by {d.approver.handle} · published{' '}
          {formatDateUtc(d.publishedAt)}. They took part in this decision, so they cannot review the appeal.
        </p>
      </section>
      <section
        aria-labelledby="appeal-grounds"
        className="flex flex-col gap-2 rounded-md border border-border p-3"
      >
        <h3 id="appeal-grounds" className="text-sm font-semibold text-text">
          Grounds ({appeal.appellantRef})
        </h3>
        <p className="text-sm whitespace-pre-wrap text-text">{appeal.grounds}</p>
        <p className="text-xs text-muted">
          Standing: {MECHANISM[appeal.standing.mechanism]},{' '}
          <span
            className={
              appeal.standing.outcome === 'pending' ? 'font-medium text-warning' : 'font-medium text-text'
            }
          >
            {appeal.standing.outcome === 'pending'
              ? 'waiting for a standing decision'
              : appeal.standing.outcome}
          </span>
          . {appeal.standing.scopeStatement}
        </p>
      </section>
    </div>
  );
}
