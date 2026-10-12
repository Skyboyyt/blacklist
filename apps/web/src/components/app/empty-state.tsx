import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/icon';

interface EmptyStateProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly icon?: IconName;
  readonly action?: ReactNode;
  /** Use h1 when the empty state is the whole page; otherwise the title is a paragraph. */
  readonly titleAs?: 'h1' | 'h2' | 'p';
}

export function EmptyState({
  title,
  description,
  icon = 'info',
  action,
  titleAs: Title = 'p',
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong px-6 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Icon name={icon} className="size-5" />
      </span>
      <div>
        <Title className="font-medium text-text">{title}</Title>
        {description ? <div className="mx-auto mt-1 max-w-md text-sm text-muted">{description}</div> : null}
      </div>
      {action}
    </div>
  );
}
