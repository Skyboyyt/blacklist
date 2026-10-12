import type { AssessmentBand, Provenance, RiskConfidence } from '@blacklist/core';
import type { Metadata } from 'next';
import { Confidence } from '@/components/app/confidence';
import { DataCard } from '@/components/app/data-card';
import { PageHeader } from '@/components/app/page-header';
import { ProvenanceLabel } from '@/components/app/provenance-label';
import { RiskBadge } from '@/components/app/risk-badge';
import {
  ASSOCIATION_DISCLAIMER,
  AUTHORIZATION_COPY,
  BAND_COPY,
  DISCLOSURE_COPY,
  DISPUTE_COPY,
  EVIDENCE_LEVEL_COPY,
  TIER_COPY,
} from '@/lib/risk/copy';

export const metadata: Metadata = { title: 'Methodology' };

const BANDS: readonly AssessmentBand[] = ['low', 'moderate', 'high', 'severe', 'not_assessed'];
const CONFIDENCE: readonly RiskConfidence[] = ['low', 'medium', 'high'];
const PROVENANCE: readonly Provenance[] = [
  'chain_fact',
  'platform_analysis',
  'moderator_finding',
  'community_allegation',
  'external_source',
  'ai_observation',
];

export default function MethodologyPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Methodology"
        description="How Blacklist presents risk, where information comes from, and what results do and do not mean."
      />

      <DataCard title="Risk bands">
        <p className="mb-4 text-sm text-muted">
          Public results show a band and a plain-language explanation. Only verified, strong evidence raises a
          band. Blacklist does not publish a numeric score.
        </p>
        <ul className="flex flex-col gap-3">
          {BANDS.map((band) => (
            <li key={band} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
              <RiskBadge band={band} className="w-fit shrink-0 sm:w-36" />
              <span className="text-sm text-muted">{BAND_COPY[band].summary}</span>
            </li>
          ))}
        </ul>
      </DataCard>

      <DataCard title={DISCLOSURE_COPY.heading}>
        <p className="text-sm text-muted">
          {DISCLOSURE_COPY.description} Examples: mint or freeze authority, upgrade or pause authority,
          transfer hooks or fees, and source code that is not verified. They are listed separately and are
          never among the factors that explain a band.
        </p>
      </DataCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <DataCard
          title="Confidence"
          description="How complete and fresh the underlying data is. Independent of the band."
        >
          <ul className="flex flex-col gap-3">
            {CONFIDENCE.map((c) => (
              <li key={c}>
                <Confidence level={c} showDescription />
              </li>
            ))}
          </ul>
        </DataCard>
        <DataCard title="Disputes and appeals">
          <ul className="flex flex-col gap-2 text-sm text-muted">
            <li>
              <strong className="text-text">{DISPUTE_COPY.under_appeal}.</strong> Filing an appeal never hides
              a finding; it is reviewed by someone who did not write or approve it.
            </li>
            <li>
              <strong className="text-text">{DISPUTE_COPY.suspended_pending_review}.</strong> In urgent cases
              a finding can be removed from assessments while it is reviewed.
            </li>
          </ul>
        </DataCard>
      </div>

      <DataCard title="Where information comes from">
        <ul className="grid gap-4 sm:grid-cols-2">
          {PROVENANCE.map((p) => (
            <li key={p}>
              <ProvenanceLabel provenance={p} showDescription />
            </li>
          ))}
        </ul>
      </DataCard>

      <DataCard title="Transfers and relationships">
        <p className="mb-4 text-sm text-muted">{ASSOCIATION_DISCLAIMER}</p>
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-text">Strength</h3>
            <dl className="flex flex-col gap-2 text-sm">
              {Object.entries(TIER_COPY).map(([key, v]) => (
                <div key={key}>
                  <dt className="font-medium text-text">{v.label}</dt>
                  <dd className="text-muted">{v.description}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-text">Evidence</h3>
            <ul className="flex flex-col gap-2 text-sm text-muted">
              {Object.values(EVIDENCE_LEVEL_COPY).map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-text">Authorization</h3>
            <ul className="flex flex-col gap-2 text-sm text-muted">
              {Object.values(AUTHORIZATION_COPY).map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          </div>
        </div>
      </DataCard>
    </div>
  );
}
