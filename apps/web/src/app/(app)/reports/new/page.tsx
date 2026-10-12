import type { Metadata } from 'next';
import { Notice } from '@/components/app/notice';
import { PageHeader } from '@/components/app/page-header';
import { NotAvailableYet } from '@/components/states/not-available';

export const metadata: Metadata = { title: 'New report' };

export default function NewReportPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Report a scam"
        description="Tell us what happened. Reports are reviewed before anything is published."
      />
      <Notice tone="warning" title="Never include secrets">
        Do not include seed phrases, private keys, passwords or signing requests in a report or screenshot.
      </Notice>
      <NotAvailableYet feature="Report submission" icon="reports" />
    </div>
  );
}
