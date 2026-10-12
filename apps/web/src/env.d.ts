/**
 * Typed environment variables visible to the web app.
 *
 * NEXT_PUBLIC_API_MODE is public, non-secret build configuration. Always read it
 * as the literal `process.env.NEXT_PUBLIC_API_MODE` so Next.js inlines it: in a
 * build without `mock`, each guarded branch is dead code and the mock adapter and
 * fixtures are dropped (verified by scripts/check-mock-exclusion.mjs).
 *
 * Server-only variables are added with src/server/env.ts in Phase 7 and must never
 * use the NEXT_PUBLIC_ prefix.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    readonly NEXT_PUBLIC_API_MODE?: 'mock';
    /** Build output directory override used by scripts/run-mock.mjs. */
    readonly BLACKLIST_DIST_DIR?: string;
  }
}
