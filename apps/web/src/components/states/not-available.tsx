import { EmptyState } from '@/components/app/empty-state';
import type { IconName } from '@/components/ui/icon';

/** Placeholder for a destination whose feature is not built yet. Honest: nothing works here. */
export function NotAvailableYet({
  feature,
  icon = 'info',
}: {
  readonly feature: string;
  readonly icon?: IconName;
}) {
  return (
    <EmptyState
      icon={icon}
      title={`${feature} is not available in this preview`}
      description="This page shows where the feature will live. It does not submit or store anything."
    />
  );
}
