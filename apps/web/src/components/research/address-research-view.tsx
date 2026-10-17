import type { ReactNode } from 'react';
import type { AddressResearch } from '@blacklist/contracts';
import { ChainBadge } from '@/components/app/chain-badge';
import { CopyableValue } from '@/components/app/copyable-value';
import { DataCard } from '@/components/app/data-card';
import { EvidenceThumbnail } from '@/components/app/evidence-thumbnail';
import { PageHeader } from '@/components/app/page-header';
import { Notice } from '@/components/app/notice';
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
import { LabelsList } from './labels-list';
import { ResponsesList } from './responses-list';
import { TransfersTable } from './transfers-table';
import { ChainProvenance } from './chain-provenance';

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
export function AddressResearchView({
  data,
  activity,
  initialTab = 'findings',
}: {
  readonly data: AddressResearch;
  /** Live blockchain activity for this address, shown in the Transfers tab. */
  readonly activity?: ReactNode;
  readonly initialTab?: 'findings' | 'transfers';
}) {
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
          <ButtonLink
            href={`/responses/new?chain=${data.chain}&address=${encodeURIComponent(data.address)}`}
            variant="secondary"
            size="sm"
          >
            Respond as the subject
          </ButtonLink>
        }
      />

      {data.degraded ? (
        <Notice tone="warning">
          Cached blockchain data is shown with its original observation time. Current providers are
          unavailable.
        </Notice>
      ) : null}
      {data.provenance ? <ChainProvenance data={data.provenance} /> : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {data.availability?.assessment === 'unavailable' ? (
          <DataCard title="Risk assessment">
            <Notice tone="info">
              Risk assessment is unavailable. These blockchain reads are not an assessment or a statement of
              safety.
            </Notice>
          </DataCard>
        ) : (
          <AssessmentPanel assessment={data.assessment} />
        )}
        <div className="flex min-w-0 flex-col gap-6">
          <DataCard title="Blockchain facts" id="facts">
            <FactsList facts={data.facts} />
          </DataCard>
          {/* Disclosures are context with zero contribution, kept apart from the assessment's factors. */}
          <DataCard title={DISCLOSURE_COPY.heading} id="disclosures">
            {data.availability?.disclosures === 'unavailable' ? (
              <p className="text-sm text-muted">Disclosure data is unavailable.</p>
            ) : (
              <DisclosuresList disclosures={data.disclosures} />
            )}
          </DataCard>
          <DataCard
            title="Public labels"
            id="labels"
            description="Identification added by staff. Labels never change the risk band."
          >
            {data.availability?.labels === 'unavailable' ? (
              <p className="text-sm text-muted">Public label data is unavailable.</p>
            ) : (
              <LabelsList labels={data.labels} />
            )}
          </DataCard>
        </div>
      </div>

      <Tabs defaultValue={initialTab}>
        <TabsList aria-label="Research details">
          <TabsTrigger value="findings">
            {data.availability?.findings === 'unavailable'
              ? 'Findings'
              : `Findings (${data.findings.length})`}
          </TabsTrigger>
          <TabsTrigger value="responses">
            {data.availability?.responses === 'unavailable'
              ? 'Responses'
              : `Responses (${data.responses.length})`}
          </TabsTrigger>
          <TabsTrigger value="transfers">
            {data.availability?.transfers === 'unavailable'
              ? 'Transfers'
              : `Transfers (${data.transfers.length})`}
          </TabsTrigger>
          <TabsTrigger value="evidence">
            {data.availability?.evidence === 'unavailable'
              ? 'Evidence'
              : `Evidence (${data.evidence.length})`}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="findings">
          {data.availability?.findings === 'unavailable' ? (
            <p className="text-sm text-muted">
              Published finding data is unavailable. No conclusion about findings has been made.
            </p>
          ) : (
            <FindingsList findings={data.findings} />
          )}
        </TabsContent>
        <TabsContent value="responses">
          {data.availability?.responses === 'unavailable' ? (
            <p className="text-sm text-muted">Published responses are unavailable.</p>
          ) : (
            <ResponsesList responses={data.responses} subject="address" />
          )}
        </TabsContent>
        <TabsContent value="transfers">
          {data.availability?.transfers !== 'unavailable' ? (
            <div className="flex flex-col gap-6">
              <TransfersTable chain={data.chain} transfers={data.transfers} />
              {activity}
            </div>
          ) : activity ? (
            activity
          ) : (
            <p className="text-sm text-muted">
              Transfer history is unavailable; a balance read does not establish activity.
            </p>
          )}
        </TabsContent>
        <TabsContent value="evidence">
          {data.availability?.evidence === 'unavailable' ? (
            <p className="text-sm text-muted">Published evidence is unavailable.</p>
          ) : data.evidence.length === 0 ? (
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
          {data.availability?.history === 'unavailable' ? (
            <p className="text-sm text-muted">Published finding history is unavailable.</p>
          ) : (
            <StatusTimeline events={data.timeline} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
