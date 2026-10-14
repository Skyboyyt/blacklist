import type { AddressResearch } from '@blacklist/contracts';
import { DataCard } from '@/components/app/data-card';
export function ChainProvenance({ data }: { readonly data: NonNullable<AddressResearch['provenance']> }) {
  const snapshot = data.snapshot;
  return (
    <DataCard title="Chain read provenance">
      <div className="flex flex-col gap-2 text-sm">
        <p>{data.source}</p>
        <p>
          Observed {data.fetchedAt} · {data.finality} · Verification: {data.verification}
        </p>
        <p className="identifier break-all">
          {snapshot.kind === 'evm_block'
            ? `Block ${snapshot.blockNumber} · ${snapshot.blockHash}`
            : snapshot.kind === 'solana_context'
              ? `Account context slot ${snapshot.contextSlot}`
              : `Signature ${snapshot.signature} · Slot ${snapshot.slot}`}
        </p>
        <p className="text-muted">
          A chain observation is not a risk assessment or proof of ownership. Single-source and unavailable
          verification cannot authorize verified evidence.
        </p>
      </div>
    </DataCard>
  );
}
