'use client';

import {
  EVIDENCE_IMAGE_TYPES,
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MAX_FILES,
  type EvidenceFile,
} from '@blacklist/contracts';
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { isMockApi } from '@/lib/api/mode';
import { DEMO_UPLOAD_NOTICE } from '@/lib/submissions/copy';

type Item =
  | {
      readonly key: string;
      readonly file: EvidenceFile;
      readonly state: 'uploading';
      readonly progress: number;
    }
  | { readonly key: string; readonly file: EvidenceFile; readonly state: 'done' }
  | { readonly key: string; readonly file: EvidenceFile; readonly state: 'failed' };

interface EvidenceUploadProps {
  readonly label: string;
  readonly onChange: (files: readonly EvidenceFile[]) => void;
  readonly error?: string | undefined;
}

const ALLOWED = new Set<string>(EVIDENCE_IMAGE_TYPES);
const EXTENSION = /\.(png|jpe?g|webp)$/i;

function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
    : `${Math.max(1, Math.round(bytes / 1024))} KiB`;
}

/**
 * Image evidence picker (PRD §5.12): PNG, JPEG or WebP, at most 10 MiB each and 10 in
 * total. Files are checked here for quick feedback; the server checks again. In the
 * demo nothing is uploaded: progress is simulated and only metadata is kept. A file
 * whose name contains "fail" simulates a failed upload so the retry path can be tried.
 */
export function EvidenceUpload(props: EvidenceUploadProps) {
  // Image uploads need the isolated evidence processor (Phase 9b); until then only text evidence is sent.
  if (!isMockApi())
    return (
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-text">{props.label}</legend>
        <p className="rounded-md border border-dashed border-border-strong bg-surface-2 p-2 text-xs text-muted">
          Image uploads are not available yet. Describe what the images show in the text, and add links or
          transaction hashes where the form allows.
        </p>
      </fieldset>
    );
  return <EvidencePicker {...props} />;
}

function EvidencePicker({ label, onChange, error }: EvidenceUploadProps) {
  const id = useId();
  const [items, setItems] = useState<readonly Item[]>([]);
  const [problems, setProblems] = useState<readonly string[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setInterval>>());
  const seq = useRef(0);

  useEffect(() => {
    onChange(items.filter((i) => i.state === 'done').map((i) => i.file));
  }, [items, onChange]);

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach((t) => clearInterval(t));
  }, []);

  function simulate(key: string, file: EvidenceFile) {
    const timer = setInterval(() => {
      setItems((current) =>
        current.map((item) => {
          if (item.key !== key || item.state !== 'uploading') return item;
          const progress = item.progress + 25;
          if (progress < 100) return { ...item, progress };
          clearInterval(timer);
          timers.current.delete(key);
          return /fail/i.test(file.name) ? { key, file, state: 'failed' } : { key, file, state: 'done' };
        }),
      );
    }, 120);
    timers.current.set(key, timer);
  }

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = '';
    const issues: string[] = [];
    const accepted: Item[] = [];
    for (const f of chosen) {
      if (!ALLOWED.has(f.type) || !EXTENSION.test(f.name)) {
        issues.push(`${f.name}: only PNG, JPEG and WebP images are accepted.`);
      } else if (f.size > EVIDENCE_MAX_BYTES) {
        issues.push(`${f.name}: larger than 10 MiB.`);
      } else if (f.size === 0) {
        issues.push(`${f.name}: the file is empty.`);
      } else if (items.length + accepted.length >= EVIDENCE_MAX_FILES) {
        issues.push(`${f.name}: at most ${EVIDENCE_MAX_FILES} images can be attached.`);
      } else {
        seq.current += 1;
        const key = `${f.name}-${f.size}-${seq.current}`;
        accepted.push({
          key,
          file: {
            id: crypto.randomUUID(),
            name: f.name.slice(0, 200),
            type: f.type as EvidenceFile['type'],
            size: f.size,
          },
          state: 'uploading',
          progress: 0,
        });
      }
    }
    setProblems(issues);
    setItems((current) => [...current, ...accepted]);
    for (const item of accepted) simulate(item.key, item.file);
  }

  function remove(key: string) {
    const timer = timers.current.get(key);
    if (timer) clearInterval(timer);
    timers.current.delete(key);
    setItems((current) => current.filter((i) => i.key !== key));
  }

  function retry(item: Item) {
    setItems((current) =>
      current.map((i) =>
        i.key === item.key ? { key: i.key, file: i.file, state: 'uploading', progress: 0 } : i,
      ),
    );
    // A retried "fail" file succeeds, so the recovery path completes.
    simulate(item.key, { ...item.file, name: item.file.name.replace(/fail/gi, 'retried') });
  }

  const busy = items.some((i) => i.state === 'uploading');
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={`${id}-help`}>
      <legend className="text-sm font-medium text-text">{label}</legend>
      <p id={`${id}-help`} className="text-xs text-muted">
        PNG, JPEG or WebP, up to 10 MiB each, at most {EVIDENCE_MAX_FILES} images. Never include seed phrases,
        private keys or passwords in a screenshot.
      </p>
      <p className="rounded-md border border-dashed border-border-strong bg-surface-2 p-2 text-xs text-muted">
        {DEMO_UPLOAD_NOTICE}
      </p>
      <label
        htmlFor={id}
        className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text focus-within:ring-2 focus-within:ring-focus hover:border-border-strong"
      >
        <Icon name="image" className="size-4" />
        Choose images
        <input
          id={id}
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
          onChange={pick}
          className="sr-only"
        />
      </label>
      <div role="status" aria-live="polite" className="text-sm">
        {busy ? <p className="text-muted">Simulating upload…</p> : null}
      </div>
      {problems.length > 0 || error ? (
        <ul className="text-sm text-danger" role="alert">
          {error ? <li>{error}</li> : null}
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
      {items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.key}
              className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-sm"
            >
              <span className="min-w-0 flex-1 break-all text-text">{item.file.name}</span>
              <span className="text-xs text-muted">{sizeLabel(item.file.size)}</span>
              {item.state === 'uploading' ? (
                <progress
                  max={100}
                  value={item.progress}
                  aria-label={`Simulated upload of ${item.file.name}`}
                  className="w-24"
                />
              ) : item.state === 'done' ? (
                <span className="text-xs text-positive">Ready (demo)</span>
              ) : (
                <>
                  <span className="text-xs text-danger">Simulated upload failed</span>
                  <Button size="sm" variant="secondary" onClick={() => retry(item)}>
                    Retry
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => remove(item.key)}
                aria-label={`Remove ${item.file.name}`}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </fieldset>
  );
}
