import '@/styles/globals.css';

import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { StyleNonce } from '@/components/layout/style-nonce';

export const metadata: Metadata = {
  title: { default: 'Blacklist — Web3 scam research', template: '%s · Blacklist' },
  description:
    'Research wallets, contracts and transactions for scam risk. Evidence-based, with clear sources and an appeal process.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0f15' },
  ],
};

async function loadDemoBanner(): Promise<ReactNode> {
  // Literal env check plus the build-time alias (next.config.ts): no mock code in non-mock builds.
  if (process.env.NEXT_PUBLIC_API_MODE !== 'mock') return null;
  const { DemoBanner } = await import('blacklist-mock-api');
  return <DemoBanner />;
}

export default async function RootLayout({ children }: { readonly children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const banner = await loadDemoBanner();

  return (
    // data-theme is set before paint by /theme-init.js, so the server markup differs on purpose.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Must be synchronous: it applies the stored theme before first paint (no flash). */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script nonce={nonce} src="/theme-init.js" />
      </head>
      <body className="min-h-dvh">
        <StyleNonce nonce={nonce} />
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-surface px-4 py-2 text-sm font-medium text-text shadow-md focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to main content
        </a>
        {banner}
        {children}
      </body>
    </html>
  );
}
