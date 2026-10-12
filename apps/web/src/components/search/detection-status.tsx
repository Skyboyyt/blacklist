'use client';

import { ChainBadge, CHAIN_NAMES } from '@/components/app/chain-badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Spinner } from '@/components/ui/spinner';
import type { SearchInputState } from '@/lib/search/search-input-state';

interface DetectionStatusProps {
  readonly id: string;
  readonly state: SearchInputState;
  readonly onChooseNetwork: (chain: string) => void;
}

/** Live format hint under the search box (announced politely to screen readers). */
export function DetectionStatus({ id, state, onChooseNetwork }: DetectionStatusProps) {
  return (
    <div id={id} aria-live="polite" className="min-h-6 text-sm text-muted" data-status={statusKey(state)}>
      <StatusContent state={state} onChooseNetwork={onChooseNetwork} />
    </div>
  );
}

function statusKey(state: SearchInputState): string {
  return state.status === 'detected' ? state.classification.kind : state.status;
}

function StatusContent({ state, onChooseNetwork }: Omit<DetectionStatusProps, 'id'>) {
  if (state.status === 'idle') {
    return <p>Ethereum and Solana wallet addresses, contract addresses and transaction hashes.</p>;
  }
  if (state.status === 'typing') {
    return (
      <p className="flex items-center gap-2">
        <Spinner size="sm" /> Detecting format…
      </p>
    );
  }

  const c = state.classification;
  switch (c.kind) {
    case 'empty':
      return null;
    case 'address':
      return (
        <p className="flex flex-wrap items-center gap-2">
          <Icon name="check" className="size-4 text-positive" />
          {c.chains.length === 1 && c.chains[0]
            ? `${CHAIN_NAMES[c.chains[0]]} address detected`
            : 'Address detected'}
          {c.chains.map((chain) => (
            <ChainBadge key={chain} chain={chain} />
          ))}
        </p>
      );
    case 'transaction':
      return (
        <p className="flex flex-wrap items-center gap-2">
          <Icon name="check" className="size-4 text-positive" />
          {CHAIN_NAMES[c.chain]} transaction detected <ChainBadge chain={c.chain} />
        </p>
      );
    case 'ambiguous_address':
      return (
        <div className="flex flex-col gap-2 rounded-md border border-info/30 bg-info-soft p-3 text-text">
          <p className="font-medium">Address detected — choose network</p>
          <p className="text-muted">
            This could be an address on more than one network. Choose which one you mean.
          </p>
          <div className="flex flex-wrap gap-2">
            {c.candidates.map((chain) => (
              <Button key={chain} size="sm" variant="secondary" onClick={() => onChooseNetwork(chain)}>
                Search on {CHAIN_NAMES[chain]}
              </Button>
            ))}
          </div>
        </div>
      );
    case 'unsupported':
      return (
        <p className="flex items-start gap-2 text-warning">
          <Icon name="info" className="mt-0.5 size-4" />
          {c.network} is not supported yet. Blacklist currently supports Ethereum and Solana.
        </p>
      );
    case 'invalid':
      return (
        <p className="flex items-start gap-2 text-danger">
          <Icon name="alert" className="mt-0.5 size-4" />
          {c.reason}
        </p>
      );
  }
}
