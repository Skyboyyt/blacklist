import type { ChainSlugDto, Transfer } from '@blacklist/contracts';
import Link from 'next/link';
import { Notice } from '@/components/app/notice';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { truncateMiddle } from '@/lib/format/address';
import { formatDateTimeUtc } from '@/lib/format/date';
import {
  ASSOCIATION_DISCLAIMER,
  AUTHORIZATION_COPY,
  EVIDENCE_LEVEL_COPY,
  TIER_COPY,
  transferMovementLabel,
} from '@/lib/risk/copy';

const TIER_TONE: Record<Transfer['tier'], BadgeTone> = {
  observed: 'neutral',
  inferred: 'warning',
  verified: 'positive',
};

/**
 * Transfers with how each was evidenced and who authorized it. Counterparties are
 * shown as facts; a transfer to or from a flagged address is never wording of guilt.
 */
export function TransfersTable({
  chain,
  transfers,
}: {
  readonly chain: ChainSlugDto;
  readonly transfers: readonly Transfer[];
}) {
  if (transfers.length === 0) return <p className="text-sm text-muted">No transfers to show.</p>;
  return (
    <div className="flex flex-col gap-3">
      <Notice tone="neutral">{ASSOCIATION_DISCLAIMER}</Notice>
      <ul className="flex flex-col gap-3">
        {transfers.map((t) => (
          <li key={t.id} className="rounded-md border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-text">
                {t.from && t.to
                  ? t.evidenceLevel === 'observed_log'
                    ? 'A record reports a transfer of'
                    : 'Transfer of'
                  : transferMovementLabel(t.direction, t.evidenceLevel)}{' '}
                {t.amount}{' '}
                <span
                  className={
                    t.assetVerified ? undefined : 'rounded border border-dashed border-warning/60 px-1'
                  }
                >
                  {t.assetSymbol}
                </span>
                {t.assetVerified ? null : (
                  <span className="ml-1 text-xs text-warning">(unverified token name)</span>
                )}
              </p>
              <Badge tone={TIER_TONE[t.tier]}>{TIER_COPY[t.tier].label}</Badge>
            </div>
            <p className="mt-1 text-muted">
              {t.from ? (
                <>
                  <span className="font-medium text-text">Sending account</span>{' '}
                  <Link
                    href={`/address/${chain}/${encodeURIComponent(t.from)}`}
                    className="identifier text-accent hover:underline"
                  >
                    {truncateMiddle(t.from, 8, 6)}
                  </Link>
                  {' · '}
                </>
              ) : null}
              <span className="font-medium text-text">{t.direction === 'in' ? 'Sender' : 'Recipient'}</span>{' '}
              <Link
                href={`/address/${chain}/${encodeURIComponent(t.counterparty)}`}
                className="identifier text-accent underline-offset-2 hover:underline"
                title={t.counterparty}
              >
                {truncateMiddle(t.counterparty, 8, 6)}
              </Link>{' '}
              · <time dateTime={t.at}>{formatDateTimeUtc(t.at)}</time>
            </p>
            <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
              <div>
                <dt className="inline text-muted">Evidence: </dt>
                <dd className="inline text-text">{EVIDENCE_LEVEL_COPY[t.evidenceLevel]}</dd>
              </div>
              <div>
                <dt className="inline text-muted">Authorization (sending side): </dt>
                <dd className="inline text-text">
                  {chain === 'solana' && t.authority && t.authorization === 'subject_signed_direct'
                    ? 'Signed directly by the owner/authority of the sending account.'
                    : AUTHORIZATION_COPY[t.authorization]}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
