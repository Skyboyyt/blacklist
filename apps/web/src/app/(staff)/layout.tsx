import type { ReactNode } from 'react';
import { ShellLayout } from '@/components/layout/shell-layout';
import { StaffOnly } from '@/components/states/access-states';
import { getResearchApi } from '@/lib/api/server';
import { isStaffViewer } from '@/lib/nav/nav-items';

/**
 * Staff area boundary (structure only). Hiding these pages is not security: staff
 * data comes only from the API, which requires a staff session with WebAuthn
 * assurance (Phase 7). Phase 1 staff pages contain no case data.
 */
export default async function StaffLayout({ children }: { readonly children: ReactNode }) {
  const viewer = await (await getResearchApi()).getViewer();
  return <ShellLayout>{isStaffViewer(viewer) ? children : <StaffOnly />}</ShellLayout>;
}
