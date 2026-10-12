/** Fictional transaction fixtures. All data is invented. */
import type { TransactionResearch } from '@blacklist/contracts';
import { EVM, SOLANA, TX } from './ids';

export const TRANSACTION_FIXTURES: TransactionResearch[] = [
  {
    chain: 'ethereum',
    hash: TX.ethereum,
    finality: 'final',
    blockOrSlot: 'Block 23,410,552',
    at: '2026-09-20T08:00:00Z',
    from: EVM.contractWithDisclosures,
    to: EVM.low,
    feePaid: '0.00042 ETH',
    status: 'success',
    transfers: [
      {
        id: 'tx1-t1',
        direction: 'out',
        counterparty: EVM.low,
        amount: '250.00',
        assetSymbol: 'USDC',
        assetVerified: true,
        evidenceLevel: 'asset_contract_log',
        authorization: 'subject_signed_direct',
        tier: 'observed',
        txHash: TX.ethereum,
        at: '2026-09-20T08:00:00Z',
      },
    ],
    facts: [
      {
        id: 'tx1-f1',
        label: 'Method',
        value: 'transfer(address,uint256)',
        provenance: 'chain_fact',
        finality: 'final',
        observedAt: '2026-09-20T08:00:00Z',
      },
    ],
  },
  {
    chain: 'solana',
    hash: TX.solana,
    finality: 'pending',
    blockOrSlot: 'Slot 361,220,904',
    at: '2026-09-23T19:05:00Z',
    from: SOLANA.lookalikeToken,
    to: SOLANA.wallet,
    feePaid: '0.000005 SOL',
    status: 'success',
    transfers: [
      {
        id: 'tx2-t1',
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
    facts: [
      {
        id: 'tx2-f1',
        label: 'Program',
        value: 'Token program: transfer',
        provenance: 'chain_fact',
        finality: 'pending',
        observedAt: '2026-09-23T19:05:00Z',
      },
    ],
  },
];
