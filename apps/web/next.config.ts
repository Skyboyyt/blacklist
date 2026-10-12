import type { NextConfig } from 'next';

/** Static security headers. The CSP is per-request (nonce) and set in src/proxy.ts. */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), clipboard-read=()',
  },
];

/**
 * Mock code is reachable only through the 'blacklist-mock-api' alias. In any build
 * without NEXT_PUBLIC_API_MODE=mock the alias points at a stub, so no mock module or
 * fixture is bundled (verified by scripts/check-mock-exclusion.mjs).
 */
const mockMode = process.env.NEXT_PUBLIC_API_MODE === 'mock';
const mockAlias = mockMode ? './src/lib/api/mock/index.ts' : './src/lib/api/mock-disabled.ts';

const nextConfig: NextConfig = {
  // Mock-mode builds go to a separate directory (scripts/run-mock.mjs).
  distDir: process.env.BLACKLIST_DIST_DIR ?? '.next',
  poweredByHeader: false,
  reactStrictMode: true,
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@blacklist/core', '@blacklist/contracts'],
  turbopack: {
    resolveAlias: { 'blacklist-mock-api': mockAlias },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
