import type { Metadata } from 'next';
import { SettingsSection } from '@/components/layout/settings-section';
import { EmailChangePanel } from '@/components/security/email-change-panel';

export const metadata: Metadata = { title: 'Change email' };

export default function ChangeEmailPage() {
  return (
    <SettingsSection
      title="Change email address"
      description="You’ll confirm the new address from your inbox. Your current address keeps working until then."
      back={{ href: '/settings/security', label: 'Security' }}
    >
      <EmailChangePanel />
    </SettingsSection>
  );
}
