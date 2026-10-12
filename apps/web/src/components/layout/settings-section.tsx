import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';

interface SettingsSectionProps {
  readonly title: string;
  readonly description?: string;
  /** Parent page for sub-pages (e.g. Security → Sessions). */
  readonly back?: { readonly href: string; readonly label: string };
  readonly children: ReactNode;
}

/** Section heading inside Settings (the layout owns the page h1). */
export function SettingsSection({ title, description, back, children }: SettingsSectionProps) {
  return (
    <section aria-labelledby="settings-section-title" className="flex flex-col gap-4">
      <div>
        {back ? (
          <Link
            href={back.href}
            className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
          >
            <Icon name="chevronRight" className="size-4 rotate-180" />
            {back.label}
          </Link>
        ) : null}
        <h2 id="settings-section-title" className="text-xl font-semibold text-text">
          {title}
        </h2>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
