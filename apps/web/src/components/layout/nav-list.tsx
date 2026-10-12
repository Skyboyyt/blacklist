'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { isActive, type NavIcon, type NavSection } from '@/lib/nav/nav-items';

const ICONS: Record<NavIcon, IconName> = {
  search: 'search',
  projects: 'link',
  dashboard: 'dashboard',
  reports: 'reports',
  appeals: 'appeals',
  settings: 'settings',
  shield: 'shield',
  book: 'book',
};

interface NavListProps {
  readonly sections: readonly NavSection[];
  /** Called after a link is chosen (closes the mobile sheet). */
  readonly onNavigate?: () => void;
}

export function NavList({ sections, onNavigate }: NavListProps) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <div key={section.id}>
          <p className="px-3 pb-2 text-xs font-semibold tracking-wide text-subtle uppercase">
            {section.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = isActive(item, pathname);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium',
                      active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-text',
                    )}
                  >
                    <Icon name={ICONS[item.icon]} className="size-4.5 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
