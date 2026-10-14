import { DataCard } from '@/components/app/data-card';
import { PageHeader } from '@/components/app/page-header';
import { Notice } from '@/components/app/notice';
import { SearchBar } from '@/components/search/search-bar';
import { ButtonLink } from '@/components/ui/button';
/** No invented private activity or zero-count claims when later services are unavailable. */
export function FoundationDashboard() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" description="Research and account settings." />
      <DataCard title="Research">
        <SearchBar />
      </DataCard>
      <DataCard title="Your activity">
        <Notice tone="info">
          Saved research activity, reports and notifications are not available yet. Nothing is submitted or
          stored by this panel.
        </Notice>
      </DataCard>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/settings/profile" variant="secondary">
          Profile settings
        </ButtonLink>
        <ButtonLink href="/settings/security" variant="secondary">
          Account security
        </ButtonLink>
      </div>
    </div>
  );
}
