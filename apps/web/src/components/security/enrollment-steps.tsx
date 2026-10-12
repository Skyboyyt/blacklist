import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';

export const ENROLLMENT_STEPS = [
  'Invitation code',
  'Password',
  'First authenticator',
  'Second authenticator',
] as const;

/** Compact step indicator for staff enrollment (text-labelled, not colour-only). */
export function EnrollmentSteps({ current }: { readonly current: number }) {
  return (
    <ol className="mb-6 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4" aria-label="Enrollment steps">
      {ENROLLMENT_STEPS.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'upcoming';
        return (
          <li
            key={label}
            aria-current={state === 'current' ? 'step' : undefined}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-2 py-1.5',
              state === 'current'
                ? 'border-accent bg-accent-soft font-medium text-text'
                : 'border-border text-muted',
            )}
          >
            {state === 'done' ? (
              <Icon name="check" className="size-3.5 text-positive" />
            ) : (
              <span aria-hidden="true">{i + 1}.</span>
            )}
            {label}
            <span className="sr-only">
              {state === 'done' ? ' (done)' : state === 'current' ? ' (current step)' : ''}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
