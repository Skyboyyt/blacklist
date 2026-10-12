import { Notice } from '@/components/app/notice';
import { PageHeader } from '@/components/app/page-header';
import { NotAvailableYet } from './not-available';

/** Staff page shell: structure only, no case data in Phase 1. */
export function StaffPlaceholder({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Staff" title={title} description={description} />
      <Notice tone="neutral">
        Staff data is only returned by the API to a staff session with passkey verification. This page holds
        no case data.
      </Notice>
      <NotAvailableYet feature={title} icon="shield" />
    </div>
  );
}
