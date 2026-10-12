import type { Viewer } from '@blacklist/contracts';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SeedPhraseNotice } from '@/components/app/seed-phrase-notice';
import { LogoutButton } from '@/components/security/logout-button';
import { Icon } from '@/components/ui/icon';
import { navSectionsFor, POLICY_LINKS } from '@/lib/nav/nav-items';
import { AccountMenu } from './account-menu';
import { Brand } from './brand';
import { MobileMenu, MobileTabBar } from './mobile-nav';
import { NavList } from './nav-list';
import { ThemeToggle } from './theme-toggle';

interface AppShellProps {
  readonly viewer: Viewer;
  readonly children: ReactNode;
}

/**
 * Application shell.
 * - Desktop (lg+): persistent sidebar, sticky header.
 * - Mobile: header with a menu sheet, plus a bottom tab bar for frequent destinations.
 */
export function AppShell({ viewer, children }: AppShellProps) {
  const sections = navSectionsFor(viewer);
  return (
    <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-16 items-center px-5">
          <Brand />
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
          <NavList sections={sections} />
        </nav>
        <div className="flex flex-col gap-3 border-t border-border p-4">
          {viewer.kind === 'signed_in' ? <LogoutButton fullWidth /> : null}
          <SeedPhraseNotice />
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-border bg-surface px-3 sm:px-4 lg:px-6">
          <MobileMenu sections={sections} signedIn={viewer.kind === 'signed_in'} />
          <div className="lg:hidden">
            <Brand />
          </div>
          <form action="/search" method="get" role="search" className="ml-4 hidden max-w-md flex-1 md:flex">
            <label htmlFor="header-search" className="sr-only">
              Search an address or transaction
            </label>
            <div className="relative w-full">
              <Icon
                name="search"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
              />
              <input
                id="header-search"
                name="q"
                type="search"
                autoComplete="off"
                spellCheck={false}
                maxLength={200}
                placeholder="Search address or transaction"
                className="identifier h-10 w-full rounded-md border border-border bg-surface-2 pr-3 pl-9 text-sm text-text placeholder:font-sans placeholder:text-subtle"
              />
            </div>
          </form>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <AccountMenu viewer={viewer} />
          </div>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="flex-1 px-4 pt-6 pb-24 focus:outline-none sm:px-6 lg:px-8 lg:pb-10"
        >
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>

        <footer className="flex flex-col gap-3 border-t border-border px-4 pt-4 pb-24 sm:px-6 lg:px-8 lg:pb-4">
          <div className="lg:hidden">
            <SeedPhraseNotice />
          </div>
          <nav aria-label="Transparency">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {POLICY_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-muted hover:text-text hover:underline">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </footer>
      </div>

      <MobileTabBar />
    </div>
  );
}
