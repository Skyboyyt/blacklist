/** Member-facing submission wording. Shared by member pages and the staff decision screens. */
import type { SubmissionKind, SubmitterReason } from '@blacklist/contracts';

export const KIND_LABEL: Readonly<Record<SubmissionKind, string>> = {
  report: 'Report',
  project_suggestion: 'Project suggestion',
  correction: 'Correction request',
  appeal: 'Appeal',
};

/** Shown to the submitter only, never on a public page. */
export const SUBMITTER_REASON_LABEL: Readonly<Record<SubmitterReason, string>> = {
  insufficient_evidence: 'There was not enough evidence to act on.',
  out_of_scope: 'The request is outside what Blacklist reviews.',
  duplicate: 'This duplicates a case that is already being handled.',
  not_reproducible: 'Staff could not confirm the problem described.',
  already_corrected: 'The information has already been corrected.',
};

export function submissionHref(kind: SubmissionKind, id: string): string {
  switch (kind) {
    case 'report':
      return `/reports/${id}`;
    case 'project_suggestion':
      return `/projects/suggestions/${id}`;
    case 'correction':
      return `/corrections/${id}`;
    case 'appeal':
      return `/appeals/${id}`;
  }
}

export const DEMO_UPLOAD_NOTICE =
  'Demo: files are not uploaded or scanned. Only each file’s name, type and size are kept in this demo session. In the real service, images are re-encoded in an isolated processor and originals are never shown.';
