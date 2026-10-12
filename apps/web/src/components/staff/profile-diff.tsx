import type { ProfileChange } from '@blacklist/contracts';

/** Current profile vs proposed correction, field by field. Plain text only. */
export function ProfileDiff({ changes }: { readonly changes: readonly ProfileChange[] }) {
  return (
    // Focusable so keyboard users can scroll the table on narrow screens.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Proposed profile changes">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <caption className="sr-only">Proposed profile changes</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th scope="col" className="py-2 pr-3 font-medium">
              Field
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Current profile
            </th>
            <th scope="col" className="py-2 font-medium">
              Proposed
            </th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => (
            <tr
              key={`${c.field}-${c.current ?? ''}-${c.proposed ?? ''}`}
              className="border-b border-border align-top"
            >
              <th scope="row" className="py-2 pr-3 text-left font-medium text-text">
                {c.label}
              </th>
              <td className="py-2 pr-3 text-muted">{c.current ?? <em>none</em>}</td>
              <td className="py-2 text-text">{c.proposed ?? <em>removed</em>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
