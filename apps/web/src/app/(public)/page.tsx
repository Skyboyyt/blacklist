import Link from 'next/link';
import type { AssessmentBand } from '@blacklist/core';
import { ProvenanceLabel } from '@/components/app/provenance-label';
import { RiskBadge } from '@/components/app/risk-badge';
import { SearchBar } from '@/components/search/search-bar';
import { getDemoExamples } from '@/lib/api/server';
import { BAND_COPY } from '@/lib/risk/copy';
import { searchHref } from '@/lib/search/search-input-state';

const BANDS: readonly AssessmentBand[] = ['low', 'moderate', 'high', 'severe', 'not_assessed'];

export default async function HomePage() {
  const examples = await getDemoExamples();
  return (
    <div className="flex flex-col gap-12">
      <section
        aria-labelledby="home-title"
        className="mx-auto flex w-full max-w-3xl flex-col gap-5 pt-4 sm:pt-10"
      >
        <div className="text-center">
          <h1 id="home-title" className="text-3xl font-semibold tracking-tight text-text sm:text-4xl">
            Research before you send
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base text-muted">
            Check a wallet, contract or transaction for scam risk. Every result shows where its information
            comes from.
          </p>
        </div>
        <SearchBar size="lg" />
        {examples.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted">Demo examples (fictional data):</p>
            <ul className="flex flex-wrap gap-2">
              {examples.map((e) => (
                <li key={e.label}>
                  <Link
                    href={searchHref(e.query)}
                    className="inline-flex min-h-9 items-center rounded-full border border-border bg-surface px-3 text-xs font-medium text-text hover:border-border-strong"
                  >
                    {e.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="bands-title" className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 id="bands-title" className="text-base font-semibold text-text">
            How to read a result
          </h2>
          <p className="mt-1 text-sm text-muted">
            Results show a risk band with an explanation. A low band is never a guarantee of safety.
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {BANDS.map((band) => (
              <li key={band} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
                <RiskBadge band={band} className="w-fit shrink-0 sm:w-36" />
                <span className="text-sm text-muted">{BAND_COPY[band].summary}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-base font-semibold text-text">Where information comes from</h2>
          <p className="mt-1 text-sm text-muted">
            Every fact, factor and finding is labelled with its source. Allegations are never presented as
            facts.
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {(['chain_fact', 'platform_analysis', 'moderator_finding', 'community_allegation'] as const).map(
              (p) => (
                <li key={p}>
                  <ProvenanceLabel provenance={p} showDescription />
                </li>
              ),
            )}
          </ul>
          <Link
            href="/methodology"
            className="mt-4 inline-block text-sm font-medium text-accent hover:underline"
          >
            Read the methodology
          </Link>
        </div>
      </section>
    </div>
  );
}
