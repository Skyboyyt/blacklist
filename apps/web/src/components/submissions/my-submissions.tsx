'use client';

import type { MemberNotice, MemberSubmissionSummary } from '@blacklist/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/app/empty-state';
import { LoadingStatus } from '@/components/states/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getMemberApi } from '@/lib/api/browser';
import { formatDateTimeUtc } from '@/lib/format/date';
import { KIND_LABEL, submissionHref } from '@/lib/submissions/copy';

type Load<T> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'ready'; readonly items: readonly T[] };

/** The member's own submissions (all kinds), newest activity first. */
export function MySubmissions() {
  const [load, setLoad] = useState<Load<MemberSubmissionSummary>>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await (await getMemberApi()).listSubmissions();
        if (active) setLoad(result.kind === 'ok' ? { kind: 'ready', items: result.data } : { kind: 'error' });
      } catch {
        if (active) setLoad({ kind: 'error' });
      }
    })();
    return () => {
      active = false;
    };
  }, [attempt]);

  if (load.kind === 'loading') return <LoadingStatus label="Loading your submissions…" />;
  if (load.kind === 'error') {
    return (
      <div className="flex flex-col items-start gap-2 text-sm">
        <p className="text-muted">Your submissions couldn’t be loaded.</p>
        <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </Button>
      </div>
    );
  }
  if (load.items.length === 0) {
    return (
      <EmptyState
        icon="reports"
        title="No submissions yet"
        description="Reports, suggestions, corrections and appeals you send appear here."
      />
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-border">
      {load.items.map((s) => (
        <li
          key={s.id}
          className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="text-xs text-muted">
              {KIND_LABEL[s.kind]} · <span className="identifier">{s.id}</span>
            </p>
            <Link
              href={submissionHref(s.kind, s.id)}
              className="font-medium break-words text-text hover:underline"
            >
              {s.title}
            </Link>
          </div>
          <div className="flex shrink-0 flex-col gap-1 sm:items-end">
            <Badge tone={s.needsAction ? 'warning' : 'info'}>
              {s.needsAction ? 'Your reply is needed' : s.status}
            </Badge>
            <time className="text-xs text-muted" dateTime={s.updatedAt}>
              Updated {formatDateTimeUtc(s.updatedAt)}
            </time>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The member's own notices (in-app notifications about their own items). */
export function MyNotices() {
  const [load, setLoad] = useState<Load<MemberNotice>>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await (await getMemberApi()).listNotices();
        if (active) setLoad(result.kind === 'ok' ? { kind: 'ready', items: result.data } : { kind: 'error' });
      } catch {
        if (active) setLoad({ kind: 'error' });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (load.kind === 'loading') return <LoadingStatus label="Loading notifications…" />;
  if (load.kind === 'error') return <p className="text-sm text-muted">Notifications couldn’t be loaded.</p>;
  if (load.items.length === 0) return <EmptyState icon="mail" title="No notifications" />;
  return (
    <ul className="flex flex-col gap-3">
      {load.items.map((n) => (
        <li key={n.id} className="rounded-md border border-border p-3 text-sm">
          {n.href ? (
            <Link href={n.href} className="text-text hover:underline">
              {n.text}
            </Link>
          ) : (
            <p className="text-text">{n.text}</p>
          )}
          <time className="mt-1 block text-xs text-muted" dateTime={n.at}>
            {formatDateTimeUtc(n.at)}
          </time>
        </li>
      ))}
    </ul>
  );
}
