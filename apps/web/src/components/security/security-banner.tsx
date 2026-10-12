import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/icon';
import { cn } from '@/lib/cn';

export type SecurityBannerKind =
  | 'session_expired'
  | 'reauth_required'
  | 'cooling_period'
  | 'change_pending'
  | 'recovery_pending'
  | 'staff_verification_required';

/**
 * Restrained, semantic status banners for account security. Informational states
 * use neutral or info styling, never red-alert treatment; only `role="status"`, so
 * screen readers announce them once without interrupting.
 */
const STYLE: Record<SecurityBannerKind, { icon: IconName; box: string; iconTone: string }> = {
  session_expired: { icon: 'clock', box: 'border-border-strong bg-surface-2', iconTone: 'text-muted' },
  reauth_required: { icon: 'lock', box: 'border-info/30 bg-info-soft', iconTone: 'text-info' },
  cooling_period: { icon: 'clock', box: 'border-info/30 bg-info-soft', iconTone: 'text-info' },
  change_pending: { icon: 'mail', box: 'border-info/30 bg-info-soft', iconTone: 'text-info' },
  recovery_pending: { icon: 'shield', box: 'border-warning/40 bg-warning-soft', iconTone: 'text-warning' },
  staff_verification_required: { icon: 'shield', box: 'border-info/30 bg-info-soft', iconTone: 'text-info' },
};

interface SecurityBannerProps {
  readonly kind: SecurityBannerKind;
  readonly title: string;
  readonly children?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
}

export function SecurityBanner({ kind, title, children, action, className }: SecurityBannerProps) {
  const style = STYLE[kind];
  return (
    <div
      role="status"
      data-banner={kind}
      className={cn(
        'flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-start',
        style.box,
        className,
      )}
    >
      <Icon name={style.icon} className={cn('mt-0.5 size-5 shrink-0', style.iconTone)} />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-text">{title}</p>
        {children ? <div className="mt-1 text-muted">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
