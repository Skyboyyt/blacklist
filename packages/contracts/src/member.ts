/**
 * MEMBER-PRIVATE DTOs: the signed-in user's own activity (PRD §1 principle 6,
 * AGENTS §5.6). Returned only to that member; never part of public research
 * (research.ts) and never visible to other users. Report receipt, draft and review
 * status live here, not in any public event.
 */
import { z } from './zod.ts';
import { isoDateTimeSchema } from './common.ts';

export const reportStatusSchema = z.enum(['draft', 'submitted', 'in_review', 'closed']);

/** One of the member's own reports. `submittedAt` is the private receipt time (null for drafts). */
export const reportSummarySchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  status: reportStatusSchema,
  submittedAt: isoDateTimeSchema.nullable(),
  updatedAt: isoDateTimeSchema,
});
export type ReportSummary = z.infer<typeof reportSummarySchema>;

/** The signed-in viewer's own activity only. No platform-wide metrics. */
export const dashboardSchema = z.strictObject({
  recentSearches: z.array(z.strictObject({ query: z.string(), at: isoDateTimeSchema })),
  myReports: z.array(reportSummarySchema),
  notices: z.array(z.strictObject({ id: z.string(), text: z.string(), at: isoDateTimeSchema })),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
