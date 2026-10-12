/** Fictional dashboard fixture: the demo viewer's own activity only, no platform metrics. */
import type { Dashboard, Viewer } from '@blacklist/contracts';
import { EVM, SOLANA } from './ids';

export const DASHBOARD_FIXTURE: Dashboard = {
  recentSearches: [
    { query: EVM.severeUnderAppeal, at: '2026-09-27T18:20:00Z' },
    { query: SOLANA.lookalikeToken, at: '2026-09-26T09:05:00Z' },
  ],
  myReports: [
    {
      id: 'demo-report-12',
      title: 'Fake airdrop claim page',
      status: 'in_review',
      submittedAt: '2026-09-26T17:40:00Z',
      updatedAt: '2026-09-27T08:00:00Z',
    },
    {
      id: 'demo-report-11',
      title: 'Impersonated support account',
      status: 'closed',
      submittedAt: '2026-09-18T09:00:00Z',
      updatedAt: '2026-09-21T12:00:00Z',
    },
  ],
  notices: [
    {
      id: 'demo-notice-1',
      text: 'Your report “Impersonated support account” led to a published finding.',
      at: '2026-09-21T12:05:00Z',
    },
  ],
};

export const VIEWER_FIXTURES: Readonly<Record<'anonymous' | 'member' | 'moderator' | 'admin', Viewer>> = {
  anonymous: { kind: 'anonymous' },
  member: { kind: 'signed_in', handle: 'demo_member', role: 'member', emailVerified: true },
  moderator: { kind: 'signed_in', handle: 'demo_moderator', role: 'moderator', emailVerified: true },
  admin: { kind: 'signed_in', handle: 'demo_admin', role: 'admin', emailVerified: true },
};
