import type { Metadata } from 'next';
import { Notice } from '@/components/app/notice';
import { PageHeader } from '@/components/app/page-header';
import { ReportForm } from '@/components/submissions/report-form';

export const metadata: Metadata = { title: 'New report' };

export default function NewReportPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Report a scam"
        description="Tell us what happened. Reports are private and reviewed by staff before anything is published. An unreviewed report has no public effect."
      />
      <Notice tone="warning" title="Never include secrets">
        Do not include seed phrases, private keys, passwords or signing requests in a report or screenshot.
      </Notice>
      <ReportForm />
    </div>
  );
}
