import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface DataCardProps {
  readonly title?: ReactNode;
  /** Heading level for the title, to keep the document outline correct. */
  readonly headingLevel?: 2 | 3;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly id?: string;
}

export function DataCard({
  title,
  headingLevel = 2,
  description,
  actions,
  children,
  className,
  id,
}: DataCardProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const generatedId = useId();
  // Every titled card is a named region (labelled by its heading).
  const headingId = id ? `${id}-title` : generatedId;
  return (
    <section
      id={id}
      aria-labelledby={title ? headingId : undefined}
      className={cn('rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5', className)}
    >
      {title ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <Heading id={headingId} className="text-base font-semibold text-text">
              {title}
            </Heading>
            {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}
