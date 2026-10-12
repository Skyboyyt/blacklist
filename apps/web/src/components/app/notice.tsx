import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/icon';
import { cn } from '@/lib/cn';

type NoticeTone = 'info' | 'warning' | 'danger' | 'neutral';

const tones: Record<NoticeTone, { box: string; icon: IconName }> = {
  info: { box: 'border-info/30 bg-info-soft', icon: 'info' },
  warning: { box: 'border-warning/40 bg-warning-soft', icon: 'alert' },
  danger: { box: 'border-danger/40 bg-danger-soft', icon: 'alert' },
  neutral: { box: 'border-border bg-surface-2', icon: 'info' },
};

const iconTone: Record<NoticeTone, string> = {
  info: 'text-info',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-muted',
};

interface NoticeProps {
  readonly tone?: NoticeTone;
  readonly title?: ReactNode;
  readonly children: ReactNode;
  /** `alert` for messages that appear in response to an action. */
  readonly role?: 'alert' | 'status';
  readonly className?: string;
}

export function Notice({ tone = 'info', title, children, role, className }: NoticeProps) {
  return (
    <div role={role} className={cn('flex gap-3 rounded-md border p-3 text-sm', tones[tone].box, className)}>
      <Icon name={tones[tone].icon} className={cn('mt-0.5 size-4 shrink-0', iconTone[tone])} />
      <div className="min-w-0 text-text">
        {title ? <p className="font-medium">{title}</p> : null}
        <div className={title ? 'mt-0.5 text-muted' : undefined}>{children}</div>
      </div>
    </div>
  );
}
