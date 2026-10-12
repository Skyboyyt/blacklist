import type { ReactNode } from 'react';
import { SeedPhraseNotice } from '@/components/app/seed-phrase-notice';
import { Brand } from '@/components/layout/brand';
import { ThemeToggle } from '@/components/layout/theme-toggle';

/** Focused layout for sign-in and account flows: no navigation, no third-party resources. */
export default function AuthLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center justify-between px-4 sm:px-6">
        <Brand />
        <ThemeToggle />
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 items-start justify-center px-4 pt-4 pb-12 focus:outline-none sm:items-center sm:pt-0"
      >
        <div className="w-full max-w-md">
          <div className="rounded-xl border-border bg-surface p-5 shadow-none sm:border sm:p-8 sm:shadow-md">
            {children}
          </div>
          <SeedPhraseNotice className="mt-6 flex items-start justify-center gap-2 text-center text-xs text-muted" />
        </div>
      </main>
    </div>
  );
}
