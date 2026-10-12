'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface RepeatableRowsProps<T> {
  readonly legend: string;
  readonly hint?: string;
  readonly rows: readonly T[];
  readonly max: number;
  readonly min?: number;
  readonly addLabel: string;
  readonly empty: () => T;
  readonly onChange: (rows: T[]) => void;
  readonly renderRow: (row: T, index: number, update: (next: T) => void) => ReactNode;
}

/** A list of similar inputs (addresses, links) with add and remove buttons, in a labelled fieldset. */
export function RepeatableRows<T>({
  legend,
  hint,
  rows,
  max,
  min = 0,
  addLabel,
  empty,
  onChange,
  renderRow,
}: RepeatableRowsProps<T>) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium text-text">{legend}</legend>
      {hint ? <p className="-mt-2 text-xs text-muted">{hint}</p> : null}
      {rows.map((row, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-md border border-border p-3">
          {renderRow(row, i, (next) => onChange(rows.map((r, j) => (j === i ? next : r))))}
          {rows.length > min ? (
            <Button
              size="sm"
              variant="ghost"
              className="w-fit"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
            >
              Remove {legend.toLowerCase()} {i + 1}
            </Button>
          ) : null}
        </div>
      ))}
      {rows.length < max ? (
        <Button size="sm" variant="secondary" className="w-fit" onClick={() => onChange([...rows, empty()])}>
          {addLabel}
        </Button>
      ) : null}
    </fieldset>
  );
}
