import type { Metadata } from 'next';
import { SettingsSection } from '@/components/layout/settings-section';
import { SecurityOverview } from '@/components/security/security-overview';

export const metadata: Metadata = { title: 'Security settings' };

export default function SecuritySettingsPage() {
  return (
    <SettingsSection
      title="Security"
      description="Your password, email address, signed-in sessions and recent security activity."
    >
      <SecurityOverview />
    </SettingsSection>
  );
}
