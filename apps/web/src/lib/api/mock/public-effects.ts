/**
 * How staff decisions change public data in the demo store (development only).
 *
 * These mirror what the backend will do in its own transactions: system publication of
 * an approved finding revision (moderation §4.2), appeal outcomes (§8.2, §9), accepted
 * profile corrections and accepted project suggestions (ADR 0010 Part A). Public records
 * get only public fields: no internal rationale, notes or submitter details ever reach
 * them. Bands are recomputed with the same §15.3 calibration proposal the staff view
 * labels as not signed off (O-12).
 */
import {
  PROJECT_CATEGORIES,
  type AddressResearch,
  type CaseDetail,
  type FindingRevision,
  type ProjectCategory,
  type RiskFactor,
} from '@blacklist/contracts';
import { projectOnlyAddress } from './fixtures/projects';
import { applyCorrection } from './profile-corrections';
import { bandForScore, PROPOSED_CONTRIBUTIONS } from './staff-scoring';
import type { MockStore } from './store';

function findAddress(store: MockStore, chain: string, address: string): AddressResearch | undefined {
  return store.addresses.find((a) => a.chain === chain && a.address === address);
}

/** Recomputes the public band from the address's current factors. */
export function recomputeAssessment(address: AddressResearch, now: string): void {
  const factors = address.assessment.factors;
  if (factors.length === 0) {
    if (address.assessment.band !== 'not_assessed') {
      address.assessment.band = 'low';
      address.assessment.explanation =
        'No published findings or approved analysis indicators apply to this address.';
    }
  } else {
    const ceiling = factors.some((f) => f.code === 'finding.severe') ? 100 : 74;
    const score = Math.min(
      ceiling,
      factors.reduce((sum, f) => sum + PROPOSED_CONTRIBUTIONS[f.code], 0),
    );
    address.assessment.band = bandForScore(score);
    address.assessment.explanation =
      'Published findings or approved indicators apply. See the factors below.';
  }
  address.assessment.asOf = now;
}

function setDispute(address: AddressResearch): void {
  const states = address.findings.map((f) => f.disputeState);
  address.assessment.disputeState = states.includes('suspended_pending_review')
    ? 'suspended_pending_review'
    : states.includes('under_appeal')
      ? 'under_appeal'
      : 'none';
}

/** The system publication caused by an approval: the finding and its factor become public. */
export function publishFinding(store: MockStore, revision: FindingRevision, now: string): void {
  if (revision.subject.kind !== 'address') return;
  const address = findAddress(store, revision.subject.chain, revision.subject.address);
  if (!address) return;
  const summary = {
    id: revision.findingId,
    title:
      revision.publicSummary.length > 80 ? `${revision.publicSummary.slice(0, 77)}…` : revision.publicSummary,
    summary: revision.publicSummary,
    provenance: 'moderator_finding' as const,
    publishedAt: now,
    disputeState: 'none' as const,
  };
  address.findings = [...address.findings.filter((f) => f.id !== revision.findingId), summary];
  const factorId = store.findingFactors.get(revision.findingId) ?? `${revision.findingId}-factor`;
  const factor: RiskFactor = {
    id: factorId,
    code: `finding.${revision.severity}`,
    explanation: revision.publicSummary,
    provenance: 'moderator_finding',
    weight: 'primary',
    observedAt: now,
  };
  address.assessment.factors = [...address.assessment.factors.filter((f) => f.id !== factorId), factor];
  store.findingFactors.set(revision.findingId, factorId);
  address.timeline.push({
    id: `${revision.findingId}-published-${revision.revisionNumber}`,
    kind: 'finding_published',
    label: `${revision.severity === 'severe' ? 'Severe' : 'A'} finding was published after approval`,
    at: now,
    actor: 'system',
  });
  setDispute(address);
  recomputeAssessment(address, now);
}

function addressWithFinding(store: MockStore, findingId: string): AddressResearch | undefined {
  return store.addresses.find((a) => a.findings.some((f) => f.id === findingId));
}

/** Filing an appeal never hides the finding: it shows "Disputed — under appeal" (moderation §9). */
export function markUnderAppeal(store: MockStore, findingId: string, now: string): void {
  const address = addressWithFinding(store, findingId);
  if (!address) return;
  // A suspension is the stronger public state; an appeal never downgrades it.
  address.findings = address.findings.map((f) =>
    f.id === findingId && f.disputeState === 'none' ? { ...f, disputeState: 'under_appeal' } : f,
  );
  address.timeline.push({
    id: `${findingId}-appeal-${now}`,
    kind: 'appeal_filed',
    label: 'An appeal was filed',
    at: now,
    actor: 'subject',
  });
  setDispute(address);
}

/** Another appeal against the finding is still open (statuses already updated by the caller). */
function hasOpenAppeal(store: MockStore, findingId: string): boolean {
  return [...store.cases.values()].some(
    (c) =>
      c.type === 'appeal_review' &&
      c.appealedDecision.findingId === findingId &&
      (c.status === 'submitted' || c.status === 'in_review'),
  );
}

/** Ends "under appeal" once no appeal against the finding is open. A suspension stays. */
function endAppealDispute(store: MockStore, findingId: string): void {
  const address = addressWithFinding(store, findingId);
  if (!address || hasOpenAppeal(store, findingId)) return;
  address.findings = address.findings.map((f) =>
    f.id === findingId && f.disputeState === 'under_appeal' ? { ...f, disputeState: 'none' } : f,
  );
}

/** Clears the dispute when an appeal is withdrawn, unless another appeal is still open. */
export function clearAppeal(store: MockStore, findingId: string): void {
  const address = addressWithFinding(store, findingId);
  if (!address) return;
  endAppealDispute(store, findingId);
  setDispute(address);
}

export function applyAppealOutcome(
  store: MockStore,
  findingId: string,
  outcome: 'upheld' | 'amended' | 'reversed',
  publicSummary: string,
  now: string,
): void {
  const address = addressWithFinding(store, findingId);
  if (!address) return;
  if (outcome === 'reversed') {
    const factorId = store.findingFactors.get(findingId);
    address.findings = address.findings.filter((f) => f.id !== findingId);
    address.assessment.factors = address.assessment.factors.filter((f) => f.id !== factorId);
  } else {
    endAppealDispute(store, findingId);
  }
  const label =
    outcome === 'reversed'
      ? `Finding reversed on appeal. ${publicSummary}`
      : outcome === 'amended'
        ? `Appeal decided: the finding will be amended. ${publicSummary}`
        : `Appeal reviewed: the finding stays. ${publicSummary}`;
  address.timeline.push({
    id: `${findingId}-decided-${now}`,
    kind: 'appeal_decided',
    label,
    at: now,
    actor: 'moderator',
  });
  setDispute(address);
  recomputeAssessment(address, now);
}

/** An accepted correction: a new staff revision of the project profile. */
export function applyProjectCorrection(
  store: MockStore,
  c: Extract<CaseDetail, { type: 'correction_request' }>,
  now: string,
): void {
  if (c.subject.kind !== 'project') return;
  const slug = c.subject.slug;
  const project = store.projects.find((p) => p.slug === slug);
  if (!project) return;
  const next = applyCorrection(
    {
      slug,
      revision: project.profileRevision,
      description: project.description,
      domains: project.domains.map((d) => d.hostname),
    },
    c.changes,
  );
  project.description = next.description;
  project.domains = next.domains.map(
    (hostname) =>
      project.domains.find((d) => d.hostname === hostname) ?? {
        hostname,
        basis: 'staff_documentary_review',
        basisNote: 'Added after staff reviewed a correction request.',
        attributedAt: now,
      },
  );
  project.profileRevision = next.revision;
  project.lastReviewedAt = now;
  project.updatedAt = now;
  project.history.push({
    id: `${slug}-rev-${next.revision}`,
    kind: 'profile_revised',
    label: 'Profile revised after a correction request',
    at: now,
    actor: 'moderator',
  });
}

function slugify(name: string, taken: (slug: string) => boolean): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'project';
  let slug = base.length >= 2 ? base : `${base}-project`;
  for (let n = 2; taken(slug); n++) slug = `${base}-${n}`;
  return slug;
}

/** An accepted suggestion: staff create a profile from it (ADR 0010 Part A). Returns the slug. */
export function createProjectFromSuggestion(
  store: MockStore,
  c: Extract<CaseDetail, { type: 'project_suggestion' }>,
  now: string,
): string {
  const { proposal } = c;
  const slug = slugify(proposal.name, (s) => store.projects.some((p) => p.slug === s));
  const address = proposal.chain === 'ethereum' ? proposal.identifier.toLowerCase() : proposal.identifier;
  if (!findAddress(store, proposal.chain, address)) {
    store.addresses.push(projectOnlyAddress(proposal.chain, address, 'contract', 'not_assessed'));
  }
  const hostnames = [
    ...new Set(
      proposal.links
        .map((l) =>
          /^hxxps?:\/\/([^/\s]+)/i
            .exec(l)?.[1]
            ?.replace(/\[\.\]/g, '.')
            .toLowerCase(),
        )
        .filter((h): h is string => h !== undefined && /^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/.test(h)),
    ),
  ];
  const category: ProjectCategory = (PROJECT_CATEGORIES as readonly string[]).includes(proposal.category)
    ? (proposal.category as ProjectCategory)
    : 'other';
  store.projects.push({
    slug,
    name: proposal.name,
    category,
    description: proposal.description,
    addresses: [
      {
        chain: proposal.chain,
        address,
        role: 'contract',
        basis: 'staff_documentary_review',
        basisNote: 'Suggested by a project representative and reviewed by staff.',
        attributedAt: now,
      },
    ],
    domains: hostnames.map((hostname) => ({
      hostname,
      basis: 'staff_documentary_review' as const,
      basisNote: 'Listed in the suggestion and reviewed by staff.',
      attributedAt: now,
    })),
    responses: [],
    history: [
      {
        id: `${slug}-created`,
        kind: 'profile_created',
        label: 'Profile created by staff from a suggestion',
        at: now,
        actor: 'moderator',
      },
    ],
    profileRevision: 1,
    lastReviewedAt: now,
    updatedAt: now,
    freshness: { state: 'current', note: null },
  });
  return slug;
}
