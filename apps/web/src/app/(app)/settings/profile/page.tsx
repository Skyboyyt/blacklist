import type { Metadata } from 'next';
import { NotAvailableYet } from '@/components/states/not-available';

export const metadata: Metadata = { title: 'Profile settings' };

export default function ProfileSettingsPage() {
  return <NotAvailableYet feature="Profile settings" icon="user" />;
}
