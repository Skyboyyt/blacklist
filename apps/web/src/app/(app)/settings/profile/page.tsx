import type { Metadata } from 'next';
import { SettingsSection } from '@/components/layout/settings-section';
import { ProfileForm } from '@/components/settings/profile-form';

export const metadata: Metadata = { title: 'Profile settings' };

export default function ProfileSettingsPage() {
  return (
    <SettingsSection
      title="Profile"
      description="Your handle and an optional display name. Neither is public in V1."
    >
      <ProfileForm />
    </SettingsSection>
  );
}
