import type { AddressResearch } from '@blacklist/contracts';
import { ChainBadge } from '@/components/app/chain-badge';
import { CopyableValue } from '@/components/app/copyable-value';
import { DataCard } from '@/components/app/data-card';
import { EvidenceThumbnail } from '@/components/app/evidence-thumbnail';
import { PageHeader } from '@/components/app/page-header';
import { StatusTimeline } from '@/components/app/status-timeline';
import { UntrustedText } from '@/components/app/untrusted-text';
import { ButtonLink } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { truncateMiddle } from '@/lib/format/address';
import { DISCLOSURE_COPY } from '@/lib/risk/copy';
import { AssessmentPanel } from './assessment-panel';
import { DisclosuresList } from './disclosures-list';
import { FactsList } from './facts-list';
import { FindingsList } from './findings-list';
import { TransfersTable } from './transfers-table';

const KIND_LABEL: Record<AddressResearch['kind'], string> = {
  wallet: 'Wallet',
  contract: 'Smart contract',
  token: 'Token',
  unknown: 'Address',
};

/**
 * Research page layout: identity → assessment → evidence tabs.
 * Identity and network come first so the user always knows exactly what is assessed.
 */
export function AddressResearchView({ data }: { readonly data: AddressResearch }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <ChainBadge chain={data.chain} /> {KIND_LABEL[data.kind]}
          </span>
        }
        title={<span className="identifier break-all">{truncateMiddle(data.displayAddress, 10, 8)}</span>}
        description={
          <span className="flex flex-col gap-2">
            <CopyableValue value={data.displayAddress} kind="address" full />
            {data.untrustedLabel ? <UntrustedText value={data.untrustedLabel} /> : null}
          </span>
        }
        actions={
          <ButtonLink href="/appeals/new" variant="secondary" size="sm">
            Appeal or respond
          </ButtonLink>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <AssessmentPanel assessment={data.assessment} />
        <div className="flex min-w-0 flex-col gap-6">
          <DataCard title="Blockchain facts" id="facts">
            <FactsList facts={data.facts} />
          </DataCard>
          {/* Disclosures are context with zero contribution, kept apart from the assessment's factors. */}
          <DataCard title={DISCLOSURE_COPY.heading} id="disclosures">
            <DisclosuresList disclosures={data.disclosures} />
          </DataCard>
        </div>
      </div>

      <Tabs defaultValue="findings">
        <TabsList aria-label="Research details">
          <TabsTrigger value="findings">Findings ({data.findings.length})</TabsTrigger>
          <TabsTrigger value="transfers">Transfers ({data.transfers.length})</TabsTrigger>
          <TabsTrigger value="evidence">Evidence ({data.evidence.length})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="findings">
          <FindingsList findings={data.findings} />
        </TabsContent>
        <TabsContent value="transfers">
          <TransfersTable chain={data.chain} transfers={data.transfers} />
        </TabsContent>
        <TabsContent value="evidence">
          {data.evidence.length === 0 ? (
            <p className="text-sm text-muted">No published evidence.</p>
          ) : (
            <div className="flex flex-wrap gap-4">
              {data.evidence.map((item) => (
                <EvidenceThumbnail key={item.id} item={item} />
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="history">
          <StatusTimeline events={data.timeline} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
