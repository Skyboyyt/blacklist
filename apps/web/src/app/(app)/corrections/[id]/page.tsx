import type { Metadata } from 'next';
import { SubmissionStatus } from '@/components/submissions/submission-status';

export const metadata: Metadata = { title: 'Correction request' };

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

/** Private to the submitter; the member API checks ownership on every read. */
export default async function CorrectionStatusPage({ params }: PageProps) {
  const { id } = await params;
  return <SubmissionStatus id={decodeURIComponent(id)} />;
}
