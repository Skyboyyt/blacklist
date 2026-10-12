/**
 * User-facing project vocabulary (PRD §5.10, §5.16–§5.17). Components take their
 * wording from here so the limits of a profile stay exact:
 * - a profile is staff research, not verification, endorsement or a safety guarantee;
 * - an attribution is a reason with a date, never proof of ownership or control;
 * - there is no combined project rating in V1; each official address is assessed alone.
 */
import type {
  AttributionBasis,
  ProjectCategory,
  ProjectDetail,
  ProjectFindingsFilter,
  ProjectResponse,
  ProjectSort,
} from '@blacklist/contracts';

export const CATEGORY_LABEL: Readonly<Record<ProjectCategory, string>> = {
  defi: 'DeFi',
  exchange: 'Exchange',
  wallet: 'Wallet',
  token: 'Token',
  nft: 'NFT',
  infrastructure: 'Infrastructure',
  dao: 'DAO',
  other: 'Other',
};

export const BASIS_COPY: Readonly<Record<AttributionBasis, { label: string; description: string }>> = {
  official_announcement: {
    label: 'Official announcement',
    description: 'Published by the project on a channel staff had already attributed to it.',
  },
  deployment_record: {
    label: 'Deployment record',
    description: 'Blockchain records link it to an address the project announced.',
  },
  authority_signature: {
    label: 'Signed message',
    description: 'The address signed a message naming the project. This shows control at that time only.',
  },
  staff_documentary_review: {
    label: 'Staff document review',
    description: 'Staff reviewed documents that support the attribution.',
  },
};

export const ATTRIBUTION_DISCLAIMER =
  'Official means staff found a documented reason to list it for this project. It is not proof of ownership or control, and it can change.';

export const ROLE_LABEL = {
  token: 'Token',
  contract: 'Contract',
  program: 'Program',
  treasury: 'Treasury',
  deployer: 'Deployer',
  other: 'Other',
} as const;

export const STANDING_LABEL: Readonly<Record<ProjectResponse['standing'], string>> = {
  wallet_signature: 'Wallet signature',
  authority_signature: 'Authority signature',
  dns_txt: 'DNS record',
  documentary: 'Staff-reviewed documents',
};

export const FINDINGS_FILTER_LABEL: Readonly<Record<ProjectFindingsFilter, string>> = {
  any: 'Any status',
  with_findings: 'Has published findings',
  without_findings: 'No published findings',
  disputed: 'Finding under appeal or suspended',
};

export const SORT_LABEL: Readonly<Record<ProjectSort, string>> = {
  name: 'Name (A–Z)',
  recently_reviewed: 'Recently reviewed',
  most_findings: 'Most published findings',
};

export const FRESHNESS_COPY: Readonly<
  Record<ProjectDetail['freshness']['state'], { label: string; tone: 'positive' | 'warning' | 'info' }>
> = {
  current: { label: 'Up to date', tone: 'positive' },
  partial: { label: 'Partial data', tone: 'info' },
  stale: { label: 'May be out of date', tone: 'warning' },
};

/** Shown on every project page and the directory. */
export const PROFILE_DISCLAIMER =
  'Project profiles summarise evidence that Blacklist staff reviewed. They are not an endorsement, do not verify the project, and do not guarantee safety or investment returns.';

export const NO_COMBINED_RATING =
  'Blacklist does not give projects a combined risk rating. Each official address is assessed on its own.';

export const NAME_WARNING =
  'Names and symbols can be copied by anyone. Confirm the network and the full official address before you interact.';

export function findingsCountLabel(count: number): string {
  if (count === 0) return 'No published findings';
  return count === 1 ? '1 published finding' : `${count} published findings`;
}
