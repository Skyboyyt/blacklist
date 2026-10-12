import type { Metadata } from 'next';
import { SettingsSection } from '@/components/layout/settings-section';
import { StaffSecurityPanel } from '@/components/security/staff-security-panel';
import { StaffOnly } from '@/components/states/access-states';
import { getResearchApi } from '@/lib/api/server';
import { isStaffViewer } from '@/lib/nav/nav-items';

export const metadata: Metadata = { title: 'Staff security' };

/** Staff-only presentation. The API alone decides staff access; this check only picks the view. */
export default async function StaffSecurityPage() {
  const viewer = await (await getResearchApi()).getViewer();
  return (
    <SettingsSection title="Staff security" back={{ href: '/settings/security', label: 'Security' }}>
      {isStaffViewer(viewer) ? <StaffSecurityPanel /> : <StaffOnly />}
    </SettingsSection>
  );
}
