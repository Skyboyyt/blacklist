import type { ReportSummary } from '@blacklist/contracts';
import { Badge, type BadgeTone } from '@/components/ui/badge';

const STATUS: Record<ReportSummary['status'], { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'Submitted', tone: 'info' },
  in_review: { label: 'In review', tone: 'warning' },
  closed: { label: 'Closed', tone: 'neutral' },
};

export function ReportStatusBadge({ status }: { readonly status: ReportSummary['status'] }) {
  return <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>;
}
