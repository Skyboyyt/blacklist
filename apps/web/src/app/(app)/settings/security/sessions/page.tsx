import type { Metadata } from 'next';
import { SettingsSection } from '@/components/layout/settings-section';
import { SessionManager } from '@/components/security/session-manager';

export const metadata: Metadata = { title: 'Sessions' };

export default function SessionsPage() {
  return (
    <SettingsSection
      title="Sessions"
      description="Devices and browsers signed in to your account. Sign out any you don’t recognize."
      back={{ href: '/settings/security', label: 'Security' }}
    >
      <SessionManager />
    </SettingsSection>
  );
}
