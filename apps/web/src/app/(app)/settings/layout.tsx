import type { ReactNode } from 'react';
import { PageHeader } from '@/components/app/page-header';
import { SettingsNav } from '@/components/layout/settings-nav';

export default function SettingsLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />
      <SettingsNav />
      {children}
    </div>
  );
}
