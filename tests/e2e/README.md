# @blacklist/e2e

Playwright end-to-end tests. **Status:** Phase 1 suites run against the web app in **mock mode** (desktop and mobile Chromium): shell and navigation, theme (no flash), search and research states, auth flows, security headers, and axe WCAG 2.2 AA audits in light and dark. Build first with `pnpm --filter @blacklist/web build:mock`, then run `pnpm test:e2e`. Full-stack suites start in Phase 7.

- Runs against a composed local/ephemeral environment (web, API, worker, evidence-processor, Postgres, MinIO, Mailpit) with **provider fakes**. Never against production or live providers.
- Browsers: Chromium, Firefox, WebKit; desktop and mobile viewports; light and dark themes.
- Uses Mailpit's API to read verification/reset emails; WebAuthn virtual authenticators for staff MFA; mock EIP-1193 and Solana Wallet Standard providers for wallet signing.
- Includes axe-core accessibility scans on key pages.

Journeys: docs/testing-strategy.md §10.
