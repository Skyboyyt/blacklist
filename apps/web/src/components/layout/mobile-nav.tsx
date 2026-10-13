'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Icon, type IconName } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import type { NavSection } from '@/lib/nav/nav-items';
import { LogoutButton } from '@/components/security/logout-button';
import { NavList } from './nav-list';

/** Menu button + slide-in sheet with the full navigation (small screens). */
export function MobileMenu({
  sections,
  signedIn,
}: {
  readonly sections: readonly NavSection[];
  readonly signedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="flex size-11 shrink-0 items-center justify-center rounded-md text-text hover:bg-surface-2 lg:hidden"
        aria-label="Open navigation menu"
      >
        <Icon name="menu" className="size-5" />
      </DialogTrigger>
      <DialogContent title="Navigation" side="left">
        <nav aria-label="Main">
          <NavList sections={sections} onNavigate={() => setOpen(false)} />
        </nav>
        {signedIn ? (
          <div className="mt-6 border-t border-border pt-4">
            <LogoutButton fullWidth />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface Tab {
  readonly href: string;
  readonly label: string;
  readonly icon: IconName;
}

const TABS: readonly Tab[] = [
  { href: '/', label: 'Home', icon: 'shield' },
  { href: '/search', label: 'Research', icon: 'search' },
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/reports', label: 'Reports', icon: 'reports' },
];

function tabActive(href: string, pathname: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/** Bottom tab bar for the most-used destinations (small screens only). */
export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Quick links"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="grid grid-cols-4">
        {TABS.map((tab) => {
          const active = tabActive(tab.href, pathname);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium',
                  active ? 'text-accent' : 'text-muted',
                )}
              >
                <Icon name={tab.icon} className="size-5" />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
