'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const LINKS = [
  { href: '/settings/profile', label: 'Profile' },
  { href: '/settings/security', label: 'Security' },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Settings sub-navigation (links, not tabs: each section is its own page). */
export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="flex gap-1 border-b border-border">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={isCurrent(pathname, l.href) ? 'page' : undefined}
          className={cn(
            '-mb-px flex h-11 items-center border-b-2 px-3 text-sm font-medium',
            isCurrent(pathname, l.href)
              ? 'border-accent text-text'
              : 'border-transparent text-muted hover:text-text',
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
