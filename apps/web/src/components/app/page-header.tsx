import type { ReactNode } from 'react';

interface PageHeaderProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** Small line above the title (e.g. section or entity type). */
  readonly eyebrow?: ReactNode;
  readonly actions?: ReactNode;
}

export function PageHeader({ title, description, eyebrow, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-sm font-medium text-muted">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-text sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-base text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
