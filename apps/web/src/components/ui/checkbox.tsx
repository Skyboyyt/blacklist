import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  readonly id: string;
  readonly label: ReactNode;
  readonly description?: ReactNode;
}

/** Native checkbox with a label and optional description (keyboard and screen-reader behaviour for free). */
export function Checkbox({ id, label, description, className, ...rest }: CheckboxProps) {
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <input
        id={id}
        type="checkbox"
        aria-describedby={descriptionId}
        className="mt-0.5 size-5 shrink-0 cursor-pointer rounded border-border-strong accent-[var(--accent)]"
        {...rest}
      />
      <div className="flex flex-col">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium text-text">
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="text-xs text-muted">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
