/**
 * Fictional STAFF-ONLY moderation fixtures (development and tests only; never in
 * production builds, and never returned by any public research method).
 *
 * Narratives, notes and evidence are invented. Reporters, appellants and requesters
 * appear only as pseudonymous references. Images are represented by metadata only:
 * there is no real file, and nothing here is ever rendered as markup.
 */
import type { AuditEntry, CaseDetail, FindingRevision, StaffEvidence, StaffRef } from '@blacklist/contracts';
import { EVM, PROJECT_EVM, SOLANA, TX } from './ids';

export const STAFF = {
  moderatorA: { id: 'stf_mod_a', handle: 'demo_moderator' },
  moderatorB: { id: 'stf_mod_b', handle: 'demo_moderator_b' },
  appealReviewer: { id: 'stf_appeal', handle: 'demo_appeal_reviewer' },
  admin: { id: 'stf_admin', handle: 'demo_admin' },
} as const satisfies Record<string, StaffRef>;

/**
 * Which demo member submitted which fixture case. `demo_member` (the default mock
 * viewer) owns a report waiting for information and a rejected correction, so the
 * member journeys start with something to act on. Other submitters are synthetic.
 */
export const CASE_OWNERS: Readonly<Record<string, string>> = {
  'RPT-1003': 'demo_member',
  'COR-3003': 'demo_member',
};

/** Who authored and approved the fixture findings that appeals can target. */
export const FINDING_PARTICIPANTS: Readonly<
  Record<string, { author: StaffRef; approver: StaffRef; severity: 'high' | 'severe' }>
> = {
  'demo-finding-401': {
    author: { id: 'stf_mod_a', handle: 'demo_moderator' },
    approver: { id: 'stf_mod_b', handle: 'demo_moderator_b' },
    severity: 'severe',
  },
  'demo-finding-301': {
    author: { id: 'stf_mod_b', handle: 'demo_moderator_b' },
    approver: { id: 'stf_mod_b', handle: 'demo_moderator_b' },
    severity: 'high',
  },
  /** Suspended pending review: it has no factor while suspended. */
  'demo-finding-501': {
    author: { id: 'stf_mod_b', handle: 'demo_moderator_b' },
    approver: { id: 'stf_mod_b', handle: 'demo_moderator_b' },
    severity: 'high',
  },
};

/** Published findings and the risk factor each one contributes (address fixtures). */
export const FINDING_FACTORS: Readonly<Record<string, string>> = {
  'demo-finding-401': 'sev-r1',
  'demo-finding-301': 'high-r1',
};

/** This case simulates another reviewer changing it just before your first action. */
export const CONFLICT_CASE_ID = 'RPT-1007';
/** Queue search text that makes the mock fail, to show the error state. */
export const QUEUE_ERROR_QUERY = 'error-demo';

const address = (chain: 'ethereum' | 'solana', value: string) =>
  ({ kind: 'address', chain, address: value, displayAddress: value }) as const;
const project = (slug: string, name: string) => ({ kind: 'project', slug, name }) as const;

function image(
  id: string,
  description: string,
  state: StaffEvidence['state'],
  stateNote: string | null = null,
): StaffEvidence {
  return {
    id,
    kind: 'image',
    description,
    submittedBy: 'reporter',
    submittedAt: '2026-09-25T09:00:00Z',
    state,
    visibility: 'staff_only',
    stateNote,
    derivative: state === 'available' ? { width: 1280, height: 720 } : null,
  };
}

function created(caseId: string, at: string): AuditEntry {
  return {
    id: `${caseId}-a0`,
    at,
    actor: 'system',
    action: 'case_created',
    caseId,
    reason: null,
    changes: [],
  };
}

const base: Pick<
  CaseDetail,
  'notes' | 'assessment' | 'submitterReason' | 'publicSummary' | 'infoRequest' | 'submitterMessages'
> = {
  notes: [],
  assessment: null,
  submitterReason: null,
  publicSummary: null,
  infoRequest: null,
  submitterMessages: [],
};

export const CASE_FIXTURES: readonly CaseDetail[] = [
  {
    ...base,
    id: 'RPT-1001',
    type: 'report_review',
    status: 'queued',
    category: 'phishing',
    subject: address('ethereum', EVM.high),
    chain: 'ethereum',
    title: 'Fake support account asked for payment to this wallet',
    assignedTo: null,
    submittedAt: '2026-09-25T09:00:00Z',
    lastActivityAt: '2026-09-25T09:05:00Z',
    slaDueAt: '2026-09-29T09:00:00Z',
    version: 1,
    reporterRef: 'Reporter R-7781',
    narrative:
      'An account claiming to be wallet support messaged me and asked me to send a “verification payment” to this address. I sent 0.3 ETH.',
    evidence: [
      image('ev-1001-1', 'Screenshot of the support conversation', 'available'),
      {
        id: 'ev-1001-2',
        kind: 'transaction_ref',
        description: 'The payment transaction',
        submittedBy: 'reporter',
        submittedAt: '2026-09-25T09:01:00Z',
        state: 'available',
        visibility: 'staff_only',
        stateNote: null,
        chain: 'ethereum',
        txHash: TX.ethereum,
        verification: 'verified_final',
      },
      {
        id: 'ev-1001-3',
        kind: 'url',
        description: 'Link the account sent',
        submittedBy: 'reporter',
        submittedAt: '2026-09-25T09:02:00Z',
        state: 'available',
        visibility: 'staff_only',
        stateNote: 'Stored as text and never fetched.',
        defangedUrl: 'hxxps://wallet-support-help[.]example/verify',
      },
    ],
    history: [created('RPT-1001', '2026-09-25T09:00:00Z')],
  },
  {
    ...base,
    id: 'RPT-1002',
    type: 'report_review',
    status: 'in_review',
    category: 'wallet_draining',
    subject: address('ethereum', EVM.severeUnderAppeal),
    chain: 'ethereum',
    title: 'Reward claim page drained approved tokens',
    assignedTo: STAFF.moderatorA,
    submittedAt: '2026-09-24T14:00:00Z',
    lastActivityAt: '2026-09-26T10:00:00Z',
    slaDueAt: '2026-09-28T14:00:00Z',
    version: 3,
    reporterRef: 'Reporter R-6120',
    narrative: 'I approved a token on a “claim rewards” page and my balance was moved a few minutes later.',
    evidence: [
      image('ev-1002-1', 'Approval prompt screenshot', 'processing', 'The image is still being sanitized.'),
      {
        id: 'ev-1002-2',
        kind: 'statement',
        description: 'Reporter’s timeline',
        submittedBy: 'reporter',
        submittedAt: '2026-09-24T14:05:00Z',
        state: 'available',
        visibility: 'staff_only',
        stateNote: null,
        text: '<b>10:02</b> approved token. 10:05 balance gone. (Shown as plain text: markup is never rendered.)',
      },
    ],
    notes: [
      {
        id: 'note-1002-1',
        author: STAFF.moderatorA,
        at: '2026-09-26T10:00:00Z',
        text: 'Matches the pattern in the published severe finding on this contract. Waiting for the screenshot.',
      },
    ],
    history: [
      created('RPT-1002', '2026-09-24T14:00:00Z'),
      {
        id: 'RPT-1002-a1',
        at: '2026-09-25T08:00:00Z',
        actor: STAFF.moderatorA,
        action: 'case_assigned',
        caseId: 'RPT-1002',
        reason: null,
        changes: [{ field: 'assigned_to', from: null, to: 'demo_moderator' }],
      },
    ],
  },
  {
    ...base,
    id: 'RPT-1003',
    type: 'report_review',
    status: 'needs_info',
    category: 'fake_token',
    subject: address('solana', SOLANA.lookalikeToken),
    chain: 'solana',
    title: 'Token pretending to be a stablecoin',
    assignedTo: STAFF.moderatorB,
    submittedAt: '2026-09-22T11:00:00Z',
    lastActivityAt: '2026-09-23T16:00:00Z',
    slaDueAt: '2026-09-30T11:00:00Z',
    version: 4,
    reporterRef: 'Reporter R-5532',
    infoRequest:
      'Please add the transaction hash of your purchase so we can confirm which token you received.',
    narrative:
      'I bought this thinking it was the official stablecoin. The reporter attached a file they saved from a website.',
    evidence: [
      image(
        'ev-1003-1',
        'File named “proof.html”',
        'rejected',
        'Not an accepted image type (HTML). It was never opened, previewed or rendered.',
      ),
      image('ev-1003-2', 'Swap confirmation screenshot', 'quarantined', 'Held in quarantine pending checks.'),
    ],
    history: [created('RPT-1003', '2026-09-22T11:00:00Z')],
  },
  {
    ...base,
    id: 'RPT-1004',
    type: 'report_review',
    status: 'queued',
    category: 'impersonation',
    subject: address('solana', SOLANA.wallet),
    chain: 'solana',
    title: 'Wallet used by an impersonated giveaway account',
    assignedTo: null,
    submittedAt: '2026-09-26T19:00:00Z',
    lastActivityAt: '2026-09-26T19:00:00Z',
    slaDueAt: '2026-09-30T19:00:00Z',
    version: 1,
    reporterRef: 'Reporter R-8890',
    narrative: 'A giveaway account copying a well-known project posted this wallet.',
    evidence: [
      image('ev-1004-1', 'Giveaway post screenshot', 'purged', 'Removed under the retention policy.'),
    ],
    history: [created('RPT-1004', '2026-09-26T19:00:00Z')],
  },
  {
    ...base,
    id: 'RPT-1005',
    type: 'report_review',
    status: 'accepted',
    category: 'rug_pull',
    subject: address('ethereum', EVM.high),
    chain: 'ethereum',
    title: 'Investment pool stopped withdrawals',
    assignedTo: STAFF.moderatorA,
    submittedAt: '2026-09-19T08:00:00Z',
    lastActivityAt: '2026-09-27T12:00:00Z',
    slaDueAt: '2026-09-23T08:00:00Z',
    version: 6,
    reporterRef: 'Reporter R-4410',
    narrative: 'The pool accepted deposits and then disabled withdrawals.',
    evidence: [image('ev-1005-1', 'Withdrawal error screenshot', 'available')],
    publicSummary: 'This address collected deposits for a pool that later disabled withdrawals.',
    history: [created('RPT-1005', '2026-09-19T08:00:00Z')],
  },
  {
    ...base,
    id: 'RPT-1006',
    type: 'report_review',
    status: 'rejected',
    category: 'other',
    subject: address('ethereum', EVM.low),
    chain: 'ethereum',
    title: 'Unexpected incoming transfer',
    assignedTo: STAFF.moderatorB,
    submittedAt: '2026-09-18T08:00:00Z',
    lastActivityAt: '2026-09-20T09:00:00Z',
    slaDueAt: '2026-09-22T08:00:00Z',
    version: 5,
    reporterRef: 'Reporter R-3301',
    narrative: 'This wallet sent me tokens I did not ask for.',
    evidence: [],
    submitterReason: 'insufficient_evidence',
    history: [created('RPT-1006', '2026-09-18T08:00:00Z')],
  },
  {
    ...base,
    id: CONFLICT_CASE_ID,
    type: 'report_review',
    status: 'in_review',
    category: 'suspicious_contract',
    subject: address('ethereum', EVM.contractWithDisclosures),
    chain: 'ethereum',
    title: 'Router contract can be paused by its owner',
    assignedTo: STAFF.moderatorB,
    submittedAt: '2026-09-23T07:00:00Z',
    lastActivityAt: '2026-09-27T07:00:00Z',
    slaDueAt: '2026-09-29T07:00:00Z',
    version: 2,
    reporterRef: 'Reporter R-2299',
    narrative: 'The owner can pause transfers. Is this a scam?',
    evidence: [],
    history: [created(CONFLICT_CASE_ID, '2026-09-23T07:00:00Z')],
  },
  {
    ...base,
    id: 'RPT-1008',
    type: 'report_review',
    status: 'screening',
    category: 'stolen_funds',
    subject: address('ethereum', EVM.notAssessed),
    chain: 'ethereum',
    title: 'Funds moved after a phishing signature',
    assignedTo: null,
    submittedAt: '2026-09-28T07:00:00Z',
    lastActivityAt: '2026-09-28T07:00:00Z',
    slaDueAt: '2026-10-02T07:00:00Z',
    version: 1,
    reporterRef: 'Reporter R-9001',
    narrative: 'My funds were moved to this address after I signed something on a fake site.',
    evidence: [
      image('ev-1008-1', 'Signature request screenshot', 'upload_pending', 'The upload has not finished.'),
    ],
    history: [created('RPT-1008', '2026-09-28T07:00:00Z')],
  },
  {
    ...base,
    id: 'APL-2001',
    type: 'appeal_review',
    status: 'submitted',
    subject: address('ethereum', EVM.severeUnderAppeal),
    chain: 'ethereum',
    title: 'Appeal against the severe finding on the claim contract',
    assignedTo: null,
    submittedAt: '2026-09-24T16:30:00Z',
    lastActivityAt: '2026-09-25T08:00:00Z',
    slaDueAt: '2026-10-08T16:30:00Z',
    version: 1,
    appellantRef: 'Appellant A-1201',
    appealedDecision: {
      findingId: 'demo-finding-401',
      revisionNumber: 1,
      severity: 'severe',
      publicSummary:
        'The contract asks users to approve tokens, then moves approved balances to the deployer.',
      author: STAFF.moderatorA,
      approver: STAFF.moderatorB,
      publishedAt: '2026-09-15T10:00:00Z',
    },
    grounds:
      'The claim contract was deployed by a former contractor without authorization. We have revoked their access and can show the deployment key was stolen.',
    standing: {
      mechanism: 'documentary',
      outcome: 'granted',
      scopeStatement:
        'Documents establish that the appellant represents the project that announced this contract. They do not establish who operated it.',
      decidedAt: '2026-09-24T18:00:00Z',
    },
    evidence: [
      {
        id: 'ev-2001-1',
        kind: 'statement',
        description: 'Appellant’s account of events',
        submittedBy: 'appellant',
        submittedAt: '2026-09-24T16:30:00Z',
        state: 'available',
        visibility: 'staff_only',
        stateNote: null,
        text: 'Our former contractor kept a deployment key after their contract ended.',
      },
      image('ev-2001-2', 'Access revocation notice', 'available'),
    ],
    history: [
      created('APL-2001', '2026-09-24T16:30:00Z'),
      {
        id: 'APL-2001-a1',
        at: '2026-09-15T10:00:00Z',
        actor: STAFF.moderatorB,
        action: 'finding_approved',
        caseId: 'APL-2001',
        reason: 'Independent approval of severe revision 1.',
        changes: [{ field: 'finding demo-finding-401', from: 'pending_second_approval', to: 'approved' }],
      },
      {
        id: 'APL-2001-a2',
        at: '2026-09-15T10:00:00Z',
        actor: 'system',
        action: 'finding_became_public',
        caseId: 'APL-2001',
        reason: null,
        changes: [{ field: 'finding demo-finding-401', from: 'approved', to: 'published' }],
      },
    ],
  },
  {
    ...base,
    id: 'APL-2002',
    type: 'appeal_review',
    status: 'in_review',
    subject: address('ethereum', EVM.high),
    chain: 'ethereum',
    title: 'Appeal: wallet was a victim of the same scheme',
    assignedTo: STAFF.appealReviewer,
    submittedAt: '2026-09-23T10:00:00Z',
    lastActivityAt: '2026-09-26T15:00:00Z',
    slaDueAt: '2026-10-07T10:00:00Z',
    version: 2,
    appellantRef: 'Appellant A-1188',
    appealedDecision: {
      findingId: 'demo-finding-301',
      revisionNumber: 1,
      severity: 'high',
      publicSummary:
        'Reviewed evidence shows victims were directed to send funds to this address by an account impersonating project support.',
      author: STAFF.moderatorB,
      approver: STAFF.moderatorB,
      publishedAt: '2026-09-21T12:00:00Z',
    },
    grounds: 'I control this wallet and I was also targeted; the scammer reused it after my keys leaked.',
    standing: {
      mechanism: 'signature',
      outcome: 'granted',
      scopeStatement:
        'A fresh signature proves control of the address on 23 Sep 2026. It does not establish past conduct.',
      decidedAt: '2026-09-23T10:05:00Z',
    },
    evidence: [
      image(
        'ev-2002-1',
        'Key leak notification',
        'unpublished',
        'Unpublished by an administrator: contained personal data.',
      ),
    ],
    history: [created('APL-2002', '2026-09-23T10:00:00Z')],
  },
  {
    ...base,
    id: 'COR-3001',
    type: 'correction_request',
    status: 'submitted',
    subject: project('demoswap', 'DemoSwap'),
    chain: null,
    title: 'Update DemoSwap description and add documentation domain',
    assignedTo: null,
    submittedAt: '2026-09-27T09:00:00Z',
    lastActivityAt: '2026-09-27T09:00:00Z',
    slaDueAt: '2026-10-04T09:00:00Z',
    version: 1,
    requesterRef: 'Requester Q-5510',
    statement: 'The description is outdated and our documentation moved to a new domain.',
    currentRevision: 2,
    changes: [
      {
        field: 'description',
        label: 'Description',
        current:
          'A fictional token-swap protocol used to demonstrate a profile with capability disclosures and no published findings.',
        proposed:
          'A fictional token-swap protocol with an upgradeable router. Used to demonstrate capability disclosures and a staff-approved correction.',
      },
      {
        field: 'domain_added',
        label: 'Official domain added',
        current: null,
        proposed: 'docs.demoswap.example',
      },
    ],
    evidence: [
      {
        id: 'ev-3001-1',
        kind: 'url',
        description: 'Announcement of the new documentation domain',
        submittedBy: 'requester',
        submittedAt: '2026-09-27T09:00:00Z',
        state: 'available',
        visibility: 'staff_only',
        stateNote: 'Stored as text and never fetched.',
        defangedUrl: 'hxxps://demoswap[.]example/blog/docs-moved',
      },
    ],
    history: [created('COR-3001', '2026-09-27T09:00:00Z')],
  },
  {
    ...base,
    id: 'COR-3002',
    type: 'correction_request',
    status: 'in_review',
    subject: project('demo-dormant-protocol', 'Demo Dormant Protocol'),
    chain: null,
    title: 'Retire the dormant protocol’s old domain',
    assignedTo: STAFF.admin,
    submittedAt: '2026-09-21T09:00:00Z',
    lastActivityAt: '2026-09-26T09:00:00Z',
    slaDueAt: '2026-09-28T09:00:00Z',
    version: 2,
    requesterRef: 'Requester Q-4471',
    statement: 'The old domain expired and was registered by someone else.',
    currentRevision: 1,
    changes: [
      {
        field: 'domain_retired',
        label: 'Official domain retired',
        current: 'dormant.example',
        proposed: null,
      },
    ],
    evidence: [image('ev-3002-1', 'Domain registration lookup', 'available')],
    history: [created('COR-3002', '2026-09-21T09:00:00Z')],
  },
  {
    ...base,
    id: 'COR-3003',
    type: 'correction_request',
    status: 'rejected',
    subject: project('demo-wallet-app', 'Demo Wallet App'),
    chain: null,
    title: 'Change wallet app description',
    assignedTo: STAFF.moderatorA,
    submittedAt: '2026-09-10T09:00:00Z',
    lastActivityAt: '2026-09-12T09:00:00Z',
    slaDueAt: '2026-09-17T09:00:00Z',
    version: 3,
    requesterRef: 'Requester Q-3001',
    statement: 'Please describe us as the most secure wallet.',
    currentRevision: 1,
    changes: [
      {
        field: 'description',
        label: 'Description',
        current: 'A fictional wallet app with official addresses on Ethereum and Solana.',
        proposed: 'The most secure wallet app.',
      },
    ],
    evidence: [],
    submitterReason: 'out_of_scope',
    history: [created('COR-3003', '2026-09-10T09:00:00Z')],
  },
];

/** Pending and historical finding revisions for the approvals screen. */
export const REVISION_FIXTURES: readonly FindingRevision[] = [
  {
    findingId: 'demo-finding-501',
    revisionNumber: 1,
    subject: address('ethereum', EVM.high),
    severity: 'high',
    publicSummary: 'This address collected deposits for a pool that later disabled withdrawals.',
    internalRationale: 'From RPT-1005: deposits traced; withdrawal function disabled by owner.',
    evidenceIds: ['ev-1005-1'],
    author: STAFF.moderatorA,
    createdAt: '2026-09-27T12:00:00Z',
    contentHash: 'a1b2c3d4e5f60718',
    status: 'proposed',
    isLatest: true,
    sourceCaseId: 'RPT-1005',
  },
  {
    findingId: 'demo-finding-502',
    revisionNumber: 1,
    subject: address('solana', SOLANA.lookalikeToken),
    severity: 'severe',
    publicSummary:
      'This token impersonates a stablecoin and its mint authority minted supply sold to victims.',
    internalRationale:
      'Severe: impersonation plus confirmed sales to victims. Needs an independent approver.',
    evidenceIds: ['ev-1001-1'],
    author: STAFF.moderatorA,
    createdAt: '2026-09-27T15:00:00Z',
    contentHash: 'b2c3d4e5f6071829',
    status: 'pending_second_approval',
    isLatest: true,
    sourceCaseId: 'RPT-1003',
  },
  {
    findingId: 'demo-finding-503',
    revisionNumber: 1,
    subject: address('ethereum', PROJECT_EVM.bridge),
    severity: 'medium',
    publicSummary: 'The bridge contract paused withdrawals for 9 days without notice.',
    internalRationale: 'First draft.',
    evidenceIds: [],
    author: STAFF.moderatorB,
    createdAt: '2026-09-26T09:00:00Z',
    contentHash: 'c3d4e5f60718293a',
    status: 'superseded',
    isLatest: false,
    sourceCaseId: null,
  },
  {
    findingId: 'demo-finding-503',
    revisionNumber: 2,
    subject: address('ethereum', PROJECT_EVM.bridge),
    severity: 'medium',
    publicSummary:
      'The bridge contract paused withdrawals for 9 days and resumed them after an announcement.',
    internalRationale: 'Revised wording after the project’s announcement.',
    // Its screenshot is still being sanitized, so approval is blocked (moderation §4.2 check 3).
    evidenceIds: ['ev-1002-1'],
    author: STAFF.moderatorB,
    createdAt: '2026-09-27T09:00:00Z',
    contentHash: 'd4e5f60718293a4b',
    status: 'proposed',
    isLatest: true,
    sourceCaseId: null,
  },
];
