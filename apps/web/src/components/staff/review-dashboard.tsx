'use client';

import {
  queueRequestSchema,
  type CaseType,
  type QueueQuery,
  type QueueResponse,
  type StaffRole,
} from '@blacklist/contracts';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/app/empty-state';
import { Button } from '@/components/ui/button';
import { LoadingStatus } from '@/components/states/skeletons';
import { getModerationApi } from '@/lib/api/browser';
import type { ModerationResult } from '@/lib/api/types';
import { QueueFilters } from './queue-filters';
import { QueueList } from './queue-list';
import { QueueSummary } from './queue-summary';
import { AccessDenied, StaffLoadError } from './staff-states';

type State =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'loaded'; readonly result: ModerationResult<QueueResponse> };

interface ReviewDashboardProps {
  readonly staffRole: StaffRole;
  readonly lockedType?: CaseType;
  /** Reference time for deadline display (fixed in tests). */
  readonly now?: string;
}

/** Review dashboard: counts, filters and the paginated queue, all from the moderation service. */
export function ReviewDashboard({ staffRole, lockedType, now }: ReviewDashboardProps) {
  const [query, setQuery] = useState<QueueQuery>(() =>
    queueRequestSchema.parse(lockedType ? { type: lockedType } : {}),
  );
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [reference] = useState(() => now ?? new Date().toISOString());

  const load = useCallback(async (q: QueueQuery) => {
    try {
      const result = await (await getModerationApi()).getQueue(q);
      setState({ kind: 'loaded', result });
    } catch {
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (active) await load(query);
    })();
    return () => {
      active = false;
    };
  }, [load, query, attempt]);

  function apply(next: QueueQuery) {
    setState({ kind: 'loading' });
    setQuery(next);
  }

  if (state.kind === 'loaded' && state.result.kind === 'error' && state.result.code === 'forbidden') {
    return <AccessDenied detail={state.result.detail} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {state.kind === 'loaded' && state.result.kind === 'ok' ? (
        <QueueSummary counts={state.result.data.counts} />
      ) : null}
      <QueueFilters
        key={JSON.stringify(query)}
        query={query}
        staffRole={staffRole}
        lockedType={lockedType}
        onApply={apply}
      />
      {state.kind === 'loading' ? <LoadingStatus label="Loading the review queue…" /> : null}
      {state.kind === 'error' || (state.kind === 'loaded' && state.result.kind === 'error') ? (
        <StaffLoadError
          onRetry={() => {
            setState({ kind: 'loading' });
            setAttempt((n) => n + 1);
          }}
        />
      ) : null}
      {state.kind === 'loaded' && state.result.kind === 'ok' ? (
        <section aria-labelledby="queue-heading" className="flex flex-col gap-4">
          <h2 id="queue-heading" className="text-sm font-medium text-muted">
            {state.result.data.totalItems === 1 ? '1 case' : `${state.result.data.totalItems} cases`}
          </h2>
          {state.result.data.items.length === 0 ? (
            <EmptyState icon="search" titleAs="p" title="No cases match these filters" />
          ) : (
            <QueueList items={state.result.data.items} now={reference} />
          )}
          {state.result.data.totalPages > 1 ? (
            <nav aria-label="Queue pages" className="flex items-center justify-between gap-3">
              <Button
                variant="secondary"
                disabled={state.result.data.page <= 1}
                onClick={() => apply({ ...query, page: query.page - 1 })}
              >
                Previous page
              </Button>
              <p className="text-sm text-muted">
                Page {state.result.data.page} of {state.result.data.totalPages}
              </p>
              <Button
                variant="secondary"
                disabled={state.result.data.page >= state.result.data.totalPages}
                onClick={() => apply({ ...query, page: query.page + 1 })}
              >
                Next page
              </Button>
            </nav>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
