/**
 * Fictional address research fixtures. All data is invented. Fixtures are
 * validated against `addressResearchSchema` when the mock loads and in tests.
 *
 * Semantics follow the approved V1 ruleset (ARCHITECTURE §15.3): only published
 * moderator findings and the approved analysis factors (symbol impersonation,
 * EIP-7702 delegation to a flagged contract) are risk factors. Capability facts
 * (mint/pause/upgrade authority, unverified source …) are disclosures with zero
 * contribution and never explain a band.
 */
import type { AddressResearch, ChainFact, Disclosure, PublicAssessment } from '@blacklist/contracts';
import { EVM, FIXED_NOW, SOLANA, TX } from './ids';

const RULESET = 'v1-demo';

/** Public source labels (P1-05): kinds of source, never links or provider details. */
const SOURCE = {
  chain: 'Finalized node read (demo provider)',
  explorer: 'Block explorer verification record (demo)',
} as const;

function facts(prefix: string, firstSeen: string, txCount: string, kind: string): ChainFact[] {
  return [
    {
      id: `${prefix}-f1`,
      label: 'Account type',
      value: kind,
      provenance: 'chain_fact',
      finality: 'final',
      source: SOURCE.chain,
      observedAt: FIXED_NOW,
    },
    {
      id: `${prefix}-f2`,
      label: 'First activity',
      value: firstSeen,
      provenance: 'chain_fact',
      finality: 'final',
      source: SOURCE.chain,
      observedAt: FIXED_NOW,
    },
    {
      id: `${prefix}-f3`,
      label: 'Transactions',
      value: txCount,
      provenance: 'chain_fact',
      finality: 'final',
      source: SOURCE.chain,
      observedAt: FIXED_NOW,
    },
  ];
}

function assessment(partial: Omit<PublicAssessment, 'asOf' | 'rulesetVersion'>): PublicAssessment {
  return { ...partial, asOf: FIXED_NOW, rulesetVersion: RULESET };
}

function disclosure(
  id: string,
  code: Disclosure['code'],
  label: string,
  explanation: string,
  provenance: Disclosure['provenance'] = 'chain_fact',
): Disclosure {
  const source = provenance === 'chain_fact' ? SOURCE.chain : SOURCE.explorer;
  return { id, code, label, explanation, provenance, source, observedAt: FIXED_NOW };
}

/** Lowercase display: fixtures do not compute EIP-55 checksums (the real API returns the display form). */
const checksum = (address: string) => address;

export const ADDRESS_FIXTURES: AddressResearch[] = [
  {
    chain: 'ethereum',
    address: EVM.notAssessed,
    displayAddress: checksum(EVM.notAssessed),
    kind: 'unknown',
    untrustedLabel: null,
    assessment: assessment({
      band: 'not_assessed',
      explanation:
        'The transaction history provider returned partial results, so this address was not assessed.',
      factors: [],
      confidence: 'low',
      coverage: 'Partial: transaction history unavailable. Balances available.',
      disputeState: 'none',
    }),
    facts: facts('na', '—', 'Unknown', 'Wallet (externally owned)'),
    disclosures: [],
    findings: [],
    transfers: [],
    evidence: [],
    timeline: [],
  },
  {
    chain: 'ethereum',
    address: EVM.low,
    displayAddress: checksum(EVM.low),
    kind: 'wallet',
    untrustedLabel: null,
    assessment: assessment({
      band: 'low',
      explanation: 'No significant risk indicators were found in the available data.',
      factors: [],
      confidence: 'high',
      coverage: 'Complete: full transaction history and balances.',
      disputeState: 'none',
    }),
    facts: facts('low', '14 Mar 2024', '312', 'Wallet (externally owned)'),
    disclosures: [],
    findings: [],
    transfers: [
      {
        id: 'low-t1',
        direction: 'in',
        counterparty: EVM.contractWithDisclosures,
        amount: '250.00',
        assetSymbol: 'USDC',
        assetVerified: true,
        evidenceLevel: 'asset_contract_log',
        // Relative to the sending side: the sender signed it, not this recipient.
        authorization: 'subject_signed_direct',
        tier: 'observed',
        txHash: TX.ethereum,
        at: '2026-09-20T08:00:00Z',
      },
      {
        // Victim case (P1-03): moved out under an approval this wallet once granted to a
        // contract with a published finding. Direction and delegation are not wrongdoing.
        id: 'low-t2',
        direction: 'out',
        counterparty: EVM.severeUnderAppeal,
        amount: '1,200.00',
        assetSymbol: 'USDC',
        assetVerified: true,
        evidenceLevel: 'balance_verified',
        authorization: 'delegated',
        tier: 'verified',
        txHash: TX.ethereum,
        at: '2026-09-21T10:30:00Z',
      },
      {
        // Spoofed-log case (P1-03): a token contract emitted a log claiming a transfer
        // from a well-known address. Reported as a log claim with unknown authorization.
        id: 'low-t3',
        direction: 'in',
        counterparty: EVM.contractWithDisclosures,
        amount: '5,000.00',
        assetSymbol: 'USDC',
        assetVerified: false,
        evidenceLevel: 'observed_log',
        authorization: 'unknown',
        tier: 'observed',
        txHash: TX.ethereum,
        at: '2026-09-22T12:00:00Z',
      },
    ],
    evidence: [],
    timeline: [],
  },
  {
    chain: 'ethereum',
    address: EVM.contractWithDisclosures,
    displayAddress: checksum(EVM.contractWithDisclosures),
    kind: 'contract',
    untrustedLabel: 'DemoSwap Router',
    assessment: assessment({
      band: 'low',
      explanation:
        'No significant risk indicators were found. This contract has technical capabilities, listed under Disclosures, that are context only and do not affect this assessment.',
      factors: [],
      confidence: 'medium',
      coverage: 'Complete transaction history. Source verification from one external provider.',
      disputeState: 'none',
    }),
    facts: facts('cwd', '2 Sep 2026', '1,204', 'Smart contract (upgradeable proxy)'),
    disclosures: [
      disclosure(
        'cwd-d1',
        'upgradeable_proxy',
        'Upgrade authority present',
        'An owner address can replace the contract logic.',
      ),
      disclosure(
        'cwd-d2',
        'pause_authority',
        'Pause authority present',
        'An owner address can pause transfers.',
      ),
      disclosure(
        'cwd-d3',
        'unverified_source',
        'Source code not verified',
        'The contract source code has not been published on a block explorer.',
        'external_source',
      ),
    ],
    findings: [],
    transfers: [],
    evidence: [],
    timeline: [],
  },
  {
    chain: 'ethereum',
    address: EVM.high,
    displayAddress: checksum(EVM.high),
    kind: 'wallet',
    untrustedLabel: null,
    assessment: assessment({
      band: 'high',
      explanation:
        'A moderator finding links this address to an impersonation scheme that collected payments.',
      factors: [
        {
          id: 'high-r1',
          code: 'finding.high',
          explanation:
            'Moderators verified that this address received payments requested by a fake support account.',
          provenance: 'moderator_finding',
          weight: 'primary',
          observedAt: '2026-09-21T12:00:00Z',
        },
      ],
      confidence: 'medium',
      coverage: 'Complete transaction history and balances.',
      disputeState: 'none',
    }),
    facts: facts('high', '30 Aug 2026', '58', 'Wallet (externally owned)'),
    disclosures: [],
    findings: [
      {
        id: 'demo-finding-301',
        title: 'Payments collected through a fake support account',
        summary:
          'Reviewed evidence shows victims were directed to send funds to this address by an account impersonating project support.',
        provenance: 'moderator_finding',
        publishedAt: '2026-09-21T12:00:00Z',
        disputeState: 'none',
      },
    ],
    transfers: [
      {
        id: 'high-t1',
        direction: 'in',
        counterparty: EVM.low,
        amount: '1.20',
        assetSymbol: 'ETH',
        assetVerified: true,
        evidenceLevel: 'native_consensus',
        authorization: 'subject_signed_direct',
        tier: 'verified',
        txHash: TX.ethereum,
        at: '2026-09-19T16:40:00Z',
      },
      {
        id: 'high-t2',
        direction: 'out',
        counterparty: EVM.contractWithDisclosures,
        amount: '900.00',
        assetSymbol: 'USDT',
        assetVerified: true,
        evidenceLevel: 'observed_log',
        authorization: 'unknown',
        tier: 'inferred',
        txHash: TX.ethereum,
        at: '2026-09-20T09:12:00Z',
      },
    ],
    evidence: [
      {
        id: 'ev-301-1',
        kind: 'image',
        caption: 'Redacted screenshot of the support conversation',
        status: 'available',
      },
      { id: 'ev-301-2', kind: 'image', caption: 'Payment request (processing)', status: 'processing' },
    ],
    timeline: [
      {
        id: 'tl-301-1',
        kind: 'finding_published',
        label: 'Finding published after approval',
        at: '2026-09-21T12:00:00Z',
        actor: 'system',
      },
    ],
  },
  {
    chain: 'ethereum',
    address: EVM.severeUnderAppeal,
    displayAddress: checksum(EVM.severeUnderAppeal),
    kind: 'contract',
    untrustedLabel: 'Claim Rewards',
    assessment: assessment({
      band: 'severe',
      explanation:
        'Moderators verified this contract drains token approvals. The finding is under appeal and remains visible.',
      factors: [
        {
          id: 'sev-r1',
          code: 'finding.severe',
          explanation:
            'Verified approval drainer: transfers approved tokens to an address controlled by the deployer.',
          provenance: 'moderator_finding',
          weight: 'primary',
          observedAt: '2026-09-15T10:00:00Z',
        },
      ],
      confidence: 'high',
      coverage: 'Complete transaction history, balances and contract code.',
      disputeState: 'under_appeal',
    }),
    facts: facts('sev', '10 Sep 2026', '4,881', 'Smart contract'),
    disclosures: [],
    findings: [
      {
        id: 'demo-finding-401',
        title: 'Approval drainer presented as a reward claim',
        summary: 'The contract asks users to approve tokens, then moves approved balances to the deployer.',
        provenance: 'moderator_finding',
        publishedAt: '2026-09-15T10:00:00Z',
        disputeState: 'under_appeal',
      },
    ],
    transfers: [],
    evidence: [
      { id: 'ev-401-1', kind: 'image', caption: 'Redacted phishing page screenshot', status: 'available' },
    ],
    timeline: [
      {
        id: 'tl-401-1',
        kind: 'finding_published',
        label: 'Finding published after independent approval',
        at: '2026-09-15T10:00:00Z',
        actor: 'system',
      },
      {
        id: 'tl-401-2',
        kind: 'appeal_filed',
        label: 'Appeal filed',
        at: '2026-09-25T14:30:00Z',
        actor: 'subject',
      },
    ],
  },
  {
    chain: 'ethereum',
    address: EVM.suspended,
    displayAddress: checksum(EVM.suspended),
    kind: 'wallet',
    untrustedLabel: null,
    assessment: assessment({
      band: 'not_assessed',
      explanation:
        'The only finding about this address is temporarily suspended pending review, so it is not used in the assessment.',
      factors: [],
      confidence: 'low',
      coverage: 'Complete transaction history. One finding excluded while suspended.',
      disputeState: 'suspended_pending_review',
    }),
    facts: facts('sus', '1 Jun 2025', '96', 'Wallet (externally owned)'),
    disclosures: [],
    findings: [
      {
        id: 'demo-finding-501',
        title: 'Suspected payment collection address',
        summary: 'This finding is suspended while an independent reviewer examines new information.',
        provenance: 'moderator_finding',
        publishedAt: '2026-09-02T09:00:00Z',
        disputeState: 'suspended_pending_review',
      },
    ],
    transfers: [],
    evidence: [],
    timeline: [
      {
        id: 'tl-501-1',
        kind: 'finding_published',
        label: 'Finding published',
        at: '2026-09-02T09:00:00Z',
        actor: 'system',
      },
      {
        id: 'tl-501-2',
        kind: 'finding_suspended',
        label: 'Temporarily suspended pending review',
        at: '2026-09-26T11:00:00Z',
        actor: 'moderator',
      },
    ],
  },
  {
    chain: 'solana',
    address: SOLANA.lookalikeToken,
    displayAddress: SOLANA.lookalikeToken,
    kind: 'token',
    untrustedLabel: 'USDC (Official)',
    assessment: assessment({
      band: 'moderate',
      explanation: 'This token uses the name and symbol of a well-known asset but is not that asset.',
      factors: [
        {
          id: 'sol-r1',
          code: 'token.symbol_impersonation',
          explanation:
            'The token’s self-reported name and symbol imitate a well-known asset with a different mint.',
          provenance: 'platform_analysis',
          weight: 'primary',
          observedAt: FIXED_NOW,
        },
      ],
      confidence: 'medium',
      coverage: 'Complete mint data. Holder history partially available.',
      disputeState: 'none',
    }),
    facts: facts('sol', '22 Sep 2026', '2,310', 'Token mint'),
    disclosures: [
      disclosure(
        'sol-d1',
        'mint_authority',
        'Mint authority active',
        'The mint authority can still create new tokens.',
      ),
    ],
    findings: [],
    transfers: [],
    evidence: [],
    timeline: [],
  },
  {
    chain: 'solana',
    address: SOLANA.wallet,
    displayAddress: SOLANA.wallet,
    kind: 'wallet',
    untrustedLabel: null,
    assessment: assessment({
      band: 'low',
      explanation: 'No significant risk indicators were found in the available data.',
      factors: [],
      confidence: 'medium',
      coverage: 'Recent history only: older transactions were not available from the provider.',
      disputeState: 'none',
    }),
    facts: facts('solw', '5 Jan 2025', '1,045', 'Wallet'),
    disclosures: [],
    findings: [],
    transfers: [
      {
        id: 'solw-t1',
        direction: 'in',
        counterparty: SOLANA.lookalikeToken,
        amount: '10,000',
        assetSymbol: 'USDC (Official)',
        assetVerified: false,
        evidenceLevel: 'asset_contract_log',
        authorization: 'unknown',
        tier: 'observed',
        txHash: TX.solana,
        at: '2026-09-23T19:05:00Z',
      },
    ],
    evidence: [],
    timeline: [],
  },
];
