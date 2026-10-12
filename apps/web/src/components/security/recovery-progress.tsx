import type { RecoveryStage, StaffRecoveryStatus } from '@blacklist/contracts';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { formatDateTimeUtc } from '@/lib/format/date';

/** The approved sequence (identity §10.11). Every step is required; none can be skipped. */
const STEPS: readonly { stage: RecoveryStage; title: string; detail: string }[] = [
  {
    stage: 'requested',
    title: 'Recovery case opened',
    detail: 'An administrator opened the case. Your staff access and existing sign-ins were suspended.',
  },
  {
    stage: 'identity_verification',
    title: 'Identity verification',
    detail: 'Two staff members, at least one an administrator, each verify your identity.',
  },
  {
    stage: 'second_admin_approval',
    title: 'Second administrator approval',
    detail: 'A different administrator approves the recovery.',
  },
  {
    stage: 'objection_window',
    title: '24-hour objection window',
    detail: 'All administrators and your account email are notified; any objection pauses recovery.',
  },
  {
    stage: 'fresh_enrollment',
    title: 'Fresh enrollment',
    detail: 'You set a new password and register two new security keys or passkeys.',
  },
  {
    stage: 'completed',
    title: 'Recovery completed',
    detail: 'Your staff access is restored with your new authenticators.',
  },
];

const ORDER = STEPS.map((s) => s.stage);

/**
 * Recovering staff member's view of their own case. Shows progress only: no reviewer
 * identities, methods or internal notes, and no way to skip or speed up a step.
 */
export function RecoveryProgress({ status }: { readonly status: StaffRecoveryStatus }) {
  if (status.stage === 'rejected' || status.stage === 'cancelled') {
    return (
      <div role="status" className="rounded-md border border-border-strong bg-surface-2 p-4 text-sm">
        <p className="font-medium text-text">
          {status.stage === 'rejected' ? 'Recovery was not approved' : 'Recovery was cancelled'}
        </p>
        <p className="mt-1 text-muted">
          Your staff access stays suspended. Contact an administrator through your organization’s usual
          channel.
        </p>
      </div>
    );
  }
  const current = ORDER.indexOf(status.stage);
  return (
    <ol className="flex flex-col gap-3" aria-label="Recovery progress">
      {STEPS.map((step, i) => {
        const state =
          i < current || status.stage === 'completed' ? 'done' : i === current ? 'current' : 'upcoming';
        return (
          <li
            key={step.stage}
            className="flex gap-3"
            aria-current={state === 'current' ? 'step' : undefined}
            data-step-state={state}
          >
            <span
              className={cn(
                'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                state === 'done' && 'border-positive bg-positive-soft text-positive',
                state === 'current' && 'border-accent bg-accent-soft text-accent',
                state === 'upcoming' && 'border-border-strong text-subtle',
              )}
            >
              {state === 'done' ? <Icon name="check" className="size-3.5" /> : i + 1}
            </span>
            <div className="text-sm">
              <p className={cn('font-medium', state === 'upcoming' ? 'text-muted' : 'text-text')}>
                {step.title}
                <span className="sr-only">
                  {state === 'done' ? ' (done)' : state === 'current' ? ' (in progress)' : ' (not started)'}
                </span>
              </p>
              <p className="text-muted">{step.detail}</p>
              {step.stage === 'identity_verification' && state === 'current' ? (
                <p className="mt-1 text-xs text-muted">
                  {status.identityVerificationsCompleted} of 2 verifications completed.
                </p>
              ) : null}
              {step.stage === 'objection_window' && state === 'current' && status.objectionWindowEndsAt ? (
                <p className="mt-1 text-xs text-muted">
                  Ends{' '}
                  <time dateTime={status.objectionWindowEndsAt}>
                    {formatDateTimeUtc(status.objectionWindowEndsAt)}
                  </time>{' '}
                  if no one objects.
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
