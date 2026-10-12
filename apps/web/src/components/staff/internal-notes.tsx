'use client';

import type { InternalNote } from '@blacklist/contracts';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTimeUtc } from '@/lib/format/date';

interface InternalNotesProps {
  readonly notes: readonly InternalNote[];
  /** Resolves true when the note was saved. */
  readonly onAdd: (text: string) => Promise<boolean>;
}

/** Internal notes: staff-only working notes. They are never published or shown to submitters. */
export function InternalNotes({ notes, onAdd }: InternalNotesProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (text.trim().length === 0) {
      setError('Write a note first.');
      return;
    }
    setError(undefined);
    setPending(true);
    if (await onAdd(text)) setText('');
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-3">
      {notes.length === 0 ? (
        <p className="text-sm text-muted">No internal notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-md border border-border bg-surface-2 p-3 text-sm">
              <p className="whitespace-pre-wrap text-text">{n.text}</p>
              <p className="mt-1 text-xs text-muted">
                {n.author.handle} · <time dateTime={n.at}>{formatDateTimeUtc(n.at)}</time>
              </p>
            </li>
          ))}
        </ul>
      )}
      <form noValidate onSubmit={submit} className="flex flex-col gap-3">
        <Field
          id="note-text"
          label="Add an internal note"
          hint="Staff only. Never published or shown to the submitter."
          error={error}
        >
          {(control) => (
            <Textarea
              {...control}
              value={text}
              maxLength={2000}
              rows={3}
              onChange={(e) => setText(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" variant="secondary" loading={pending} loadingLabel="Saving…" className="w-fit">
          Save note
        </Button>
      </form>
    </div>
  );
}
