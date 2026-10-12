import type { OfficialAddress } from '@blacklist/contracts';
import Link from 'next/link';
import { ChainBadge } from '@/components/app/chain-badge';
import { CopyableValue } from '@/components/app/copyable-value';
import { DisclosuresList } from '@/components/research/disclosures-list';
import { formatDateUtc } from '@/lib/format/date';
import { BASIS_COPY, ROLE_LABEL } from '@/lib/projects/copy';
import { AddressAssessmentSummary } from './address-assessment-summary';

/**
 * Official addresses, each with its network, full identifier, attribution basis, its
 * own assessment, and its capability disclosures kept apart from the risk factors.
 */
export function OfficialAddressList({ addresses }: { readonly addresses: readonly OfficialAddress[] }) {
  if (addresses.length === 0) {
    return (
      <p className="text-sm text-muted">Staff have not listed official addresses for this project yet.</p>
    );
  }
  return (
    <ul className="flex flex-col gap-4">
      {addresses.map((a) => {
        const basis = BASIS_COPY[a.basis];
        return (
          <li
            key={`${a.chain}:${a.address}`}
            className="flex flex-col gap-4 rounded-lg border border-border p-4"
            data-official-address={a.address}
          >
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <ChainBadge chain={a.chain} />
                <span className="font-medium text-text">{ROLE_LABEL[a.role]}</span>
              </div>
              <CopyableValue value={a.displayAddress} kind="address" full />
              <Link
                href={`/address/${a.chain}/${encodeURIComponent(a.address)}`}
                className="w-fit text-sm font-medium text-accent hover:underline"
              >
                Open full address research
              </Link>
              <p className="text-xs text-muted">
                <span className="font-medium text-text">Why it is listed: {basis.label}.</span> {a.basisNote}{' '}
                {basis.description} Listed{' '}
                <time dateTime={a.attributedAt}>{formatDateUtc(a.attributedAt)}</time>.
              </p>
            </div>
            <div className="grid gap-4 border-t border-border pt-4 lg:grid-cols-2">
              <section aria-label={`Assessment of this ${ROLE_LABEL[a.role].toLowerCase()} address`}>
                <h3 className="mb-2 text-sm font-semibold text-text">Address assessment</h3>
                <AddressAssessmentSummary assessment={a.assessment} />
              </section>
              <section aria-label={`Disclosures for this ${ROLE_LABEL[a.role].toLowerCase()} address`}>
                <h3 className="mb-2 text-sm font-semibold text-text">Capability disclosures</h3>
                <DisclosuresList disclosures={a.disclosures} />
              </section>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
