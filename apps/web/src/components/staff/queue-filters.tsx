'use client';

import {
  CHAIN_SLUGS,
  STATUSES_BY_TYPE,
  type CaseType,
  type QueueQuery,
  type StaffRole,
} from '@blacklist/contracts';
import { useState, type FormEvent } from 'react';
import { CHAIN_NAMES } from '@/components/app/chain-badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { CASE_TYPE_LABEL, STATUS_LABEL } from '@/lib/staff/copy';

interface QueueFiltersProps {
  readonly query: QueueQuery;
  readonly staffRole: StaffRole;
  /** Fixed case type for this view (e.g. the appeals queue). */
  readonly lockedType?: CaseType | undefined;
  readonly onApply: (query: QueueQuery) => void;
}

const SORT_LABEL = {
  sla_due: 'Review deadline (soonest)',
  newest: 'Newest first',
  last_activity: 'Recent activity',
};

/** Queue filters. Status options always match the documented statuses of the chosen type. */
export function QueueFilters({ query, staffRole, lockedType, onApply }: QueueFiltersProps) {
  const [draft, setDraft] = useState<QueueQuery>(query);
  const types: readonly CaseType[] =
    lockedType !== undefined
      ? [lockedType]
      : staffRole === 'appeal_reviewer'
        ? ['appeal_review']
        : ['report_review', 'appeal_review', 'correction_request', 'project_suggestion'];
  const type = lockedType ?? draft.type;
  const statuses = type ? STATUSES_BY_TYPE[type] : [...new Set(types.flatMap((t) => STATUSES_BY_TYPE[t]))];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onApply({ ...draft, ...(lockedType ? { type: lockedType } : {}), page: 1 });
  }

  return (
    <form
      onSubmit={submit}
      role="search"
      aria-label="Filter the review queue"
      className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <Field
        id="queue-q"
        label="Search"
        hint="Case ID, title, address or project"
        className="sm:col-span-2 lg:col-span-3"
      >
        {(control) => (
          <Input
            {...control}
            type="search"
            value={draft.query ?? ''}
            onChange={(e) => setDraft({ ...draft, query: e.target.value })}
            autoComplete="off"
          />
        )}
      </Field>
      {lockedType === undefined ? (
        <Field id="queue-type" label="Case type">
          {(control) => (
            <Select
              {...control}
              value={draft.type ?? ''}
              onChange={(e) => {
                const value = e.target.value as CaseType | '';
                const { type: _old, status: _status, ...rest } = draft;
                setDraft(value ? { ...rest, type: value } : rest);
              }}
            >
              {types.length > 1 ? <option value="">All types</option> : null}
              {types.map((t) => (
                <option key={t} value={t}>
                  {CASE_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}
      <Field id="queue-status" label="Status">
        {(control) => (
          <Select
            {...control}
            value={draft.status ?? ''}
            onChange={(e) => {
              const { status: _old, ...rest } = draft;
              setDraft(e.target.value ? { ...rest, status: e.target.value } : rest);
            }}
          >
            <option value="">Any status</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s] ?? s}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field id="queue-chain" label="Network">
        {(control) => (
          <Select
            {...control}
            value={draft.chain ?? ''}
            onChange={(e) => {
              const { chain: _old, ...rest } = draft;
              const value = e.target.value;
              setDraft(value === 'ethereum' || value === 'solana' ? { ...rest, chain: value } : rest);
            }}
          >
            <option value="">All networks</option>
            {CHAIN_SLUGS.map((c) => (
              <option key={c} value={c}>
                {CHAIN_NAMES[c]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field id="queue-assignment" label="Assignment">
        {(control) => (
          <Select
            {...control}
            value={draft.assignment}
            onChange={(e) => setDraft({ ...draft, assignment: e.target.value as QueueQuery['assignment'] })}
          >
            <option value="any">Anyone</option>
            <option value="mine">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
          </Select>
        )}
      </Field>
      <Field id="queue-sort" label="Sort by">
        {(control) => (
          <Select
            {...control}
            value={draft.sort}
            onChange={(e) => setDraft({ ...draft, sort: e.target.value as QueueQuery['sort'] })}
          >
            {Object.entries(SORT_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-3">
        <Button type="submit">Apply</Button>
      </div>
    </form>
  );
}
