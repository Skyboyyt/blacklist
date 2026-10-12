import 'server-only';

import type { StaffRole } from '@blacklist/contracts';
import { getResearchApi } from '@/lib/api/server';
import { staffRoleOf } from './permissions';

/** The current staff viewer for page layout. The staff layout already blocks non-staff. */
export async function getStaffViewer(): Promise<{
  readonly role: StaffRole;
  readonly handle: string;
} | null> {
  const viewer = await (await getResearchApi()).getViewer();
  const role = staffRoleOf(viewer);
  return role && viewer.kind === 'signed_in' ? { role, handle: viewer.handle } : null;
}
