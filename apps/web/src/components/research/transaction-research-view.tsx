import type { TransactionResearch } from '@blacklist/contracts';
import Link from 'next/link';
import { ChainBadge } from '@/components/app/chain-badge';
import { CopyableValue } from '@/components/app/copyable-value';
import { DataCard } from '@/components/app/data-card';
import { Notice } from '@/components/app/notice';
import { PageHeader } from '@/components/app/page-header';
import { Badge } from '@/components/ui/badge';
import { truncateMiddle } from '@/lib/format/address';
import { formatDateTimeUtc } from '@/lib/format/date';
import { FactsList } from './facts-list';
import { TransfersTable } from './transfers-table';

function AddressLink({ chain, address }: { readonly chain: string; readonly address: string }) {
  return (
    <Link
      href={`/address/${chain}/${encodeURIComponent(address)}`}
      className="identifier text-accent hover:underline"
      title={address}
    >
      {truncateMiddle(address, 8, 6)}
    </Link>
  );
}

export function TransactionResearchView({ data }: { readonly data: TransactionResearch }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <ChainBadge chain={data.chain} /> Transaction
          </span>
        }
        title={<span className="identifier">{truncateMiddle(data.hash, 10, 8)}</span>}
        description={<CopyableValue value={data.hash} kind="transaction hash" full />}
      />

      {data.finality === 'pending' ? (
        <Notice tone="warning" title="Not final yet">
          This transaction is not finalized. Its details can still change, and it is not used in any
          assessment until it is final.
        </Notice>
      ) : null}
      {data.finality === 'orphaned' ? (
        <Notice tone="danger" title="Dropped from the chain">
          This transaction is no longer part of the canonical chain.
        </Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <DataCard title="Summary" id="summary">
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Status</dt>
              <dd>
                <Badge tone={data.status === 'success' ? 'neutral' : 'danger'}>
                  {data.status === 'success' ? 'Succeeded' : 'Failed'}
                </Badge>
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Included in</dt>
              <dd className="text-text">{data.blockOrSlot}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Time</dt>
              <dd className="text-text">
                <time dateTime={data.at}>{formatDateTimeUtc(data.at)}</time>
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">From</dt>
              <dd>
                <AddressLink chain={data.chain} address={data.from} />
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">To</dt>
              <dd>
                {data.to ? (
                  <AddressLink chain={data.chain} address={data.to} />
                ) : (
                  <span className="text-muted">Contract creation</span>
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Fee</dt>
              <dd className="text-text">{data.feePaid}</dd>
            </div>
          </dl>
        </DataCard>
        <DataCard title="Blockchain facts" id="facts">
          <FactsList facts={data.facts} />
        </DataCard>
      </div>

      <DataCard title="Transfers" id="transfers">
        <TransfersTable chain={data.chain} transfers={data.transfers} />
      </DataCard>
    </div>
  );
}
