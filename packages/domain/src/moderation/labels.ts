/** Member-facing status text (matches the web mock, so both adapters read the same). */
export const REPORT_STATUS_LABEL: Readonly<Record<string, string>> = {
  submitted: 'Submitted',
  screening: 'Being checked',
  queued: 'Waiting for review',
  in_review: 'In review',
  needs_info: 'Information requested',
  accepted: 'Accepted',
  rejected: 'Not accepted',
  rejected_abusive: 'Not accepted',
  withdrawn: 'Withdrawn',
};

/** Report statuses before any decision; a report can be withdrawn only in these. */
export const OPEN_REPORT_STATUSES: readonly string[] = [
  'submitted',
  'screening',
  'queued',
  'in_review',
  'needs_info',
];

/** `https://evil.example/x` becomes `hxxps://evil[.]example/x`: never clickable, never fetched. */
export function defangUrl(value: string): string {
  return value.replace(/^http(s?):\/\//i, (_m, s: string) => `hxxp${s}://`).replace(/\./g, '[.]');
}

/** Member-facing status text for appeals and responses (matches the web mock). */
export const REDRESS_STATUS_LABEL: Readonly<Record<string, string>> = {
  submitted: 'Submitted',
  in_review: 'In review',
  upheld: 'Decided: finding upheld',
  amended: 'Decided: finding amended',
  reversed: 'Decided: finding reversed',
  published: 'Published',
  rejected: 'Not accepted',
  withdrawn: 'Withdrawn',
};
