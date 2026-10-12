import type { Metadata } from 'next';
import { SettingsSection } from '@/components/layout/settings-section';
import { PasswordChangeForm } from '@/components/security/password-change-form';

export const metadata: Metadata = { title: 'Change password' };

export default function ChangePasswordPage() {
  return (
    <SettingsSection title="Change password" back={{ href: '/settings/security', label: 'Security' }}>
      <PasswordChangeForm />
    </SettingsSection>
  );
}
