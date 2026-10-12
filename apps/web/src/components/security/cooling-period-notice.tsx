import type { CoolingPeriod } from '@blacklist/contracts';
import { formatDateTimeUtc } from '@/lib/format/date';
import { SecurityBanner } from './security-banner';

/**
 * Cooling period after a password reset (identity §9: 72 hours). In V1 it blocks
 * email change only. Calm wording: it protects the account, nothing is wrong.
 */
export function CoolingPeriodNotice({ cooling }: { readonly cooling: CoolingPeriod }) {
  return (
    <SecurityBanner kind="cooling_period" title="Some changes are paused after a password reset">
      To protect your account, changing your email address is unavailable until{' '}
      <time dateTime={cooling.until}>{formatDateTimeUtc(cooling.until)}</time>. Everything else works as
      usual. If you did not reset your password, change it now and review your sessions.
    </SecurityBanner>
  );
}
