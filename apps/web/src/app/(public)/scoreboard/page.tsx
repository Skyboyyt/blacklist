import { CHAIN_SLUGS, type ChainSlugDto } from '@blacklist/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CHAIN_NAMES } from '@/components/app/chain-badge';
import { Notice } from '@/components/app/notice';
import { PageHeader } from '@/components/app/page-header';
import { ScoreboardView } from '@/components/projects/scoreboard-view';
import { UnsupportedNetwork } from '@/components/research/research-unavailable';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { getResearchApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Project risk ranking' };

interface PageProps {
  readonly searchParams: Promise<{ chain?: string | string[] }>;
}

/** Band ranking of reviewed projects (ADR 0012, band-only). Plain GET form: the URL keeps the network. */
export default async function ScoreboardPage({ searchParams }: PageProps) {
  const { chain: raw } = await searchParams;
  const value = typeof raw === 'string' ? raw : '';
  const chain = (CHAIN_SLUGS as readonly string[]).includes(value) ? (value as ChainSlugDto) : undefined;
  const unsupported = value !== '' && !chain;
  const data = unsupported ? null : await (await getResearchApi()).getScoreboard(chain ? { chain } : {});

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Project risk ranking"
        description="Reviewed projects ranked by the highest risk band among their official addresses. A higher place means more risk was found."
      />
      <Notice tone="info" title="How to read this ranking">
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            There is no score. Projects in the same band share a rank (shown as “2=”) and are listed A–Z.
          </li>
          <li>
            A low band means no significant risk indicators were found. It never means safe, endorsed or
            verified.
          </li>
          <li>
            Projects with stale, missing, suspended or low-confidence data are listed separately and not
            ranked.
          </li>
          <li>
            Read the{' '}
            <Link href="/methodology" className="font-medium text-accent hover:underline">
              methodology
            </Link>{' '}
            for how bands are set.
          </li>
        </ul>
      </Notice>
      <form method="get" action="/scoreboard" className="flex flex-wrap items-end gap-3">
        <Field id="scoreboard-chain" label="Network">
          {(control) => (
            <Select {...control} name="chain" defaultValue={chain ?? ''}>
              <option value="">All supported networks</option>
              {CHAIN_SLUGS.map((c) => (
                <option key={c} value={c}>
                  {CHAIN_NAMES[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </form>
      {data ? <ScoreboardView data={data} /> : <UnsupportedNetwork network={value} />}
    </div>
  );
}
