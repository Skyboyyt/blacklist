import type { QueueCounts } from '@blacklist/contracts';

const ITEMS: readonly { key: keyof QueueCounts; label: string }[] = [
  { key: 'openReports', label: 'Open reports' },
  { key: 'needsInfo', label: 'Waiting for information' },
  { key: 'openAppeals', label: 'Open appeals' },
  { key: 'openCorrections', label: 'Open corrections' },
  { key: 'openSuggestions', label: 'Open project suggestions' },
  { key: 'unassigned', label: 'Unassigned open cases' },
  { key: 'pendingApprovals', label: 'Revisions awaiting approval' },
];

/** Counts derived by the service from the case records in the caller's scope. */
export function QueueSummary({ counts }: { readonly counts: QueueCounts }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
      {ITEMS.map((item) => (
        <div key={item.key} className="rounded-lg border border-border bg-surface p-3">
          <dt className="text-xs font-medium text-muted">{item.label}</dt>
          <dd className="mt-1 text-2xl font-semibold text-text tabular-nums">{counts[item.key]}</dd>
        </div>
      ))}
    </dl>
  );
}
