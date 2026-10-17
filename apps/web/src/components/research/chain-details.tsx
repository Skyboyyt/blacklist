import { formatTokenAmount } from '@blacklist/contracts';
import Link from 'next/link';
import type {
  AddressHistory,
  ChainSlugDto,
  tokenResearchSchema,
  contractResearchSchema,
  tokenBalancesSchema,
} from '@blacklist/contracts';
import type { z } from 'zod';
import type { ResearchResult } from '@/lib/api/types';
import { DataCard } from '@/components/app/data-card';
import { Notice } from '@/components/app/notice';
import { UntrustedText } from '@/components/app/untrusted-text';
import { ButtonLink } from '@/components/ui/button';
import { truncateMiddle } from '@/lib/format/address';
type Token = z.infer<typeof tokenResearchSchema>;
type Contract = z.infer<typeof contractResearchSchema>;
type Balances = z.infer<typeof tokenBalancesSchema>;
export interface ChainDetailsData {
  readonly direction?: 'in' | 'out' | 'all';
  readonly history?: ResearchResult<AddressHistory>;
  readonly token?: ResearchResult<Token>;
  readonly contract?: ResearchResult<Contract>;
  readonly balances?: ResearchResult<Balances>;
}
function Source({ data }: { readonly data: AddressHistory['source'] }) {
  return (
    <p className="text-xs text-muted">
      {data.source} · Observed {data.fetchedAt} · {data.finality} · {data.verification}
      {data.degraded ? ' · Cached while provider unavailable' : ''}
    </p>
  );
}
function Missing({ result }: { readonly result: ResearchResult<unknown> }) {
  return (
    <p className="text-sm text-muted">
      {result.kind === 'not_found'
        ? 'No supported record at this snapshot.'
        : result.kind === 'provider_unavailable' && result.reason === 'not_supported'
          ? 'This capability is not supported by the configured provider.'
          : 'This blockchain read is currently unavailable. No data has been inferred.'}
    </p>
  );
}
/** Present public DTOs only. Data fetching and capability selection stay in the page/client. */
export function ChainDetails({
  chain,
  address,
  data,
}: {
  readonly chain: ChainSlugDto;
  readonly address: string;
  readonly data: ChainDetailsData;
}) {
  const base = `/address/${chain}/${encodeURIComponent(address)}`;
  return (
    <div className="flex flex-col gap-6">
      {data.history ? (
        <DataCard title="Blockchain transaction activity">
          {data.history.kind !== 'found' ? (
            <Missing result={data.history} />
          ) : (
            <div className="flex flex-col gap-3">
              <Source data={data.history.data.source} />
              <Notice tone="info">
                {data.history.data.coverage} Activity does not establish ownership or wrongdoing.
              </Notice>
              {data.history.data.restarted ? (
                <Notice tone="warning">
                  The provider changed. This page restarted at the recorded snapshot; entries can repeat.
                </Notice>
              ) : null}
              <div className="flex gap-3">
                {(chain === 'ethereum' ? (['in', 'out'] as const) : (['all', 'in', 'out'] as const)).map(
                  (direction) => (
                    <Link
                      key={direction}
                      href={`${base}?direction=${direction}`}
                      className="text-sm text-accent"
                    >
                      {direction === 'in'
                        ? 'Incoming'
                        : direction === 'out'
                          ? 'Outgoing'
                          : 'Address signatures'}
                    </Link>
                  ),
                )}
              </div>
              {data.history.data.items.length === 0 ? (
                <p className="text-sm text-muted">
                  No activity returned on this page; coverage remains incomplete.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {data.history.data.items.map((item) => (
                    <li key={item.hash} className="text-sm">
                      <Link
                        href={`/tx/${chain}/${encodeURIComponent(item.hash)}`}
                        className="identifier text-accent break-all"
                      >
                        {truncateMiddle(item.hash)}
                      </Link>{' '}
                      · {item.status} · {item.direction} · Block/slot {item.block ?? 'unknown'}
                    </li>
                  ))}
                </ul>
              )}
              {data.history.data.nextCursor ? (
                <ButtonLink
                  variant="secondary"
                  href={`${base}?direction=${data.direction ?? (chain === 'ethereum' ? 'out' : 'all')}&cursor=${encodeURIComponent(data.history.data.nextCursor)}`}
                >
                  Next page
                </ButtonLink>
              ) : null}
            </div>
          )}
        </DataCard>
      ) : null}
      {data.token ? (
        <DataCard title="Token facts">
          {data.token.kind !== 'found' ? (
            <Missing result={data.token} />
          ) : (
            <div className="flex flex-col gap-2">
              <Source data={data.token.data.source} />
              <p className="text-sm">
                {data.token.data.standard} · Decimals {data.token.data.decimals ?? 'unknown'}
              </p>
              {data.token.data.nameOnchain ? <UntrustedText value={data.token.data.nameOnchain} /> : null}
              {data.token.data.symbolOnchain ? <UntrustedText value={data.token.data.symbolOnchain} /> : null}
              <p className="text-sm break-all">
                Total supply:{' '}
                {data.token.data.totalSupplyRaw === null
                  ? 'unknown'
                  : data.token.data.decimals === null
                    ? `${data.token.data.totalSupplyRaw} raw units (decimals unknown)`
                    : formatTokenAmount(data.token.data.totalSupplyRaw, data.token.data.decimals)}
              </p>
              <p className="text-sm text-muted">{data.token.data.coverage}</p>
            </div>
          )}
        </DataCard>
      ) : null}
      {data.contract ? (
        <DataCard title="Contract facts">
          {data.contract.kind !== 'found' ? (
            <Missing result={data.contract} />
          ) : (
            <div className="flex flex-col gap-2">
              <Source data={data.contract.data.source} />
              <p className="text-sm break-all">
                Bytecode hash: {data.contract.data.bytecodeHash ?? 'unknown'}
              </p>
              <p className="text-sm text-muted">{data.contract.data.coverage}</p>
            </div>
          )}
        </DataCard>
      ) : null}
      {data.balances ? (
        <DataCard title="Supported token balances">
          {data.balances.kind !== 'found' ? (
            <Missing result={data.balances} />
          ) : (
            <div className="flex flex-col gap-2">
              <Source data={data.balances.data.source} />
              <p className="text-sm text-muted">{data.balances.data.coverage}</p>
              {data.balances.data.balances.length === 0 ? (
                <p className="text-sm text-muted">
                  No supported balances returned; this is not a complete inventory.
                </p>
              ) : (
                <ul>
                  {data.balances.data.balances.map((item) => (
                    <li className="text-sm break-all" key={item.token}>
                      <Link
                        className="identifier text-accent"
                        href={`/address/${chain}/${encodeURIComponent(item.token)}`}
                      >
                        {truncateMiddle(item.token)}
                      </Link>{' '}
                      ·{' '}
                      {item.decimals === null
                        ? `${item.amountRaw} raw units (decimals unknown)`
                        : formatTokenAmount(item.amountRaw, item.decimals)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </DataCard>
      ) : null}
    </div>
  );
}
