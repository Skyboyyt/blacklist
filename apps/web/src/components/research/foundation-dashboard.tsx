import { DataCard } from '@/components/app/data-card';
import { PageHeader } from '@/components/app/page-header';
import { Notice } from '@/components/app/notice';
import { SearchBar } from '@/components/search/search-bar';
import { ButtonLink } from '@/components/ui/button';
import { MySubmissions } from '@/components/submissions/my-submissions';
/**
 * Live dashboard while saved research activity is not stored (Phase 10): research, the
 * member's own submissions from the API, and settings. No invented activity or counts.
 */
export function FoundationDashboard() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" description="Research, your submissions and account settings." />
      <DataCard title="Research">
        <SearchBar />
      </DataCard>
      <DataCard
        title="My submissions"
        actions={
          <ButtonLink href="/reports/new" size="sm">
            Report a scam
          </ButtonLink>
        }
      >
        <MySubmissions />
      </DataCard>
      <Notice tone="info">Saved research history is not available yet. Searches are not stored.</Notice>
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
