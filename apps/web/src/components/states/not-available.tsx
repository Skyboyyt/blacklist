import { EmptyState } from '@/components/app/empty-state';
import type { IconName } from '@/components/ui/icon';

/** Placeholder for a destination whose feature is not built yet. Honest: nothing works here. */
export function NotAvailableYet({
  feature,
  icon = 'info',
  titleAs = 'p',
}: {
  readonly feature: string;
  readonly icon?: IconName;
  readonly titleAs?: 'h1' | 'h2' | 'p';
}) {
  return (
    <EmptyState
      icon={icon}
      titleAs={titleAs}
      title={`${feature} is not available in this preview`}
      description="The live service for this feature is not available yet. No records have been loaded, and this page does not submit or store anything."
    />
  );
}
