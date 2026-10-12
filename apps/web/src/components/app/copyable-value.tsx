'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { truncateMiddle } from '@/lib/format/address';

interface CopyableValueProps {
  /** The exact value copied (and read by screen readers). */
  readonly value: string;
  /** What the value is, for the copy button's accessible name ("address", "transaction hash"). */
  readonly kind: string;
  /** Show the full value wrapped across lines instead of truncating the middle. */
  readonly full?: boolean;
  readonly className?: string;
}

/**
 * Monospace identifier with a copy button. The truncated form is visual only:
 * the full value is in the accessible name, the title and the clipboard.
 */
export function CopyableValue({ value, kind, full = false, className }: CopyableValueProps) {
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied('copied');
    } catch {
      setCopied('failed');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied('idle'), 2000);
  }

  return (
    <span className={cn('inline-flex max-w-full items-center gap-1', className)}>
      <span className={cn('identifier text-sm', full ? 'identifier-wrap' : 'truncate')} title={value}>
        {full ? (
          value
        ) : (
          <>
            <span aria-hidden="true">{truncateMiddle(value)}</span>
            <span className="sr-only">{value}</span>
          </>
        )}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${kind}`}
        className="flex size-8 shrink-0 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-text"
      >
        <Icon name={copied === 'copied' ? 'check' : 'copy'} className="size-4" />
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied === 'copied' ? `${kind} copied` : copied === 'failed' ? `Could not copy ${kind}` : ''}
      </span>
    </span>
  );
}
