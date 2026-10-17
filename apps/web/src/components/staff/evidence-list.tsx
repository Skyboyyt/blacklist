import type { StaffEvidence } from '@blacklist/contracts';
import Link from 'next/link';
import { ChainBadge } from '@/components/app/chain-badge';
import { CopyableValue } from '@/components/app/copyable-value';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { formatDateTimeUtc } from '@/lib/format/date';
import { EVIDENCE_STATE_COPY } from '@/lib/staff/copy';
import { isMockApi } from '@/lib/api/mode';
import { DerivativeDownload } from './derivative-download';

const SUBMITTER = {
  reporter: 'Reporter',
  appellant: 'Appellant',
  requester: 'Requester',
  responder: 'Responder',
  staff: 'Staff',
} as const;
const VERIFICATION = {
  verified_final: 'Verified against finalized chain data',
  pending: 'Not final yet',
  not_found: 'Not found on chain',
} as const;

function Body({ item }: { readonly item: StaffEvidence }) {
  const available = EVIDENCE_STATE_COPY[item.state].available;
  if (!available) {
    return (
      <p className="flex items-start gap-2 rounded-md border border-dashed border-border-strong bg-surface-2 p-3 text-sm text-muted">
        <Icon name="lock" className="mt-0.5 size-4 shrink-0" />
        <span>
          <span className="font-medium text-text">Not available for review.</span> {item.stateNote}
        </span>
      </p>
    );
  }
  switch (item.kind) {
    case 'image':
      // Only a sanitized derivative is ever offered, as a download. The demo has no files.
      if (!isMockApi()) return <DerivativeDownload evidenceId={item.id} size={item.derivative} />;
      return (
        <div className="flex aspect-video max-w-sm items-center justify-center rounded-md border border-border bg-surface-2 text-sm text-muted">
          <span className="flex flex-col items-center gap-1 text-center">
            <Icon name="image" className="size-6" />
            Sanitized derivative{item.derivative ? ` ${item.derivative.width}×${item.derivative.height}` : ''}
            <span className="text-xs">Demo placeholder: no file exists</span>
          </span>
        </div>
      );
    case 'transaction_ref':
      return (
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="flex flex-wrap items-center gap-2">
            <ChainBadge chain={item.chain} /> {VERIFICATION[item.verification]}
          </span>
          <CopyableValue value={item.txHash} kind="transaction hash" />
          <Link
            href={`/tx/${item.chain}/${item.txHash}`}
            className="w-fit font-medium text-accent hover:underline"
          >
            Open transaction research
          </Link>
        </div>
      );
    case 'url':
      return (
        <p className="text-sm">
          <span className="identifier break-all text-text">{item.defangedUrl}</span>
          <span className="block text-xs text-muted">
            Defanged text. Never fetched or opened by Blacklist.
          </span>
        </p>
      );
    case 'statement':
      return <p className="text-sm whitespace-pre-wrap text-text">{item.text}</p>;
  }
}

/**
 * Evidence with source role, time, state and visibility. Nothing is rendered as markup:
 * statements are text, URLs are defanged text, and images are offered only as sanitized
 * derivatives to download (placeholders in the demo). Unavailable items explain why.
 */
export function EvidenceList({ evidence }: { readonly evidence: readonly StaffEvidence[] }) {
  if (evidence.length === 0) return <p className="text-sm text-muted">No evidence was submitted.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {evidence.map((item) => {
        const state = EVIDENCE_STATE_COPY[item.state];
        return (
          <li
            key={item.id}
            data-evidence-state={item.state}
            className="flex flex-col gap-2 rounded-md border border-border p-3"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="identifier text-muted">{item.id}</span>
              <Badge tone={state.available ? 'positive' : 'warning'}>{state.label}</Badge>
              <Badge tone="neutral">{item.visibility === 'staff_only' ? 'Staff only' : 'Published'}</Badge>
            </div>
            <p className="text-sm font-medium text-text">{item.description}</p>
            <Body item={item} />
            <p className="text-xs text-muted">
              Submitted by: {SUBMITTER[item.submittedBy]} ·{' '}
              <time dateTime={item.submittedAt}>{formatDateTimeUtc(item.submittedAt)}</time>
            </p>
          </li>
        );
      })}
    </ul>
  );
}
