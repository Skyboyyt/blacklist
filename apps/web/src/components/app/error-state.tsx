import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';

interface ErrorStateProps {
  readonly title: string;
  readonly description?: ReactNode;
  /** Opaque request reference for support. Never show stack traces or internals. */
  readonly reference?: string | undefined;
  readonly action?: ReactNode;
}

export function ErrorState({ title, description, reference, action }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-danger/40 bg-danger-soft px-6 py-10 text-center"
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-surface text-danger">
        <Icon name="alert" className="size-5" />
      </span>
      <div>
        <p className="font-medium text-text">{title}</p>
        {description ? <div className="mx-auto mt-1 max-w-md text-sm text-muted">{description}</div> : null}
        {reference ? (
          <p className="mt-2 text-xs text-muted">
            Reference: <span className="identifier">{reference}</span>
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
