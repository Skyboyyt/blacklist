/** Example searches shown on the home page in mock mode (one per UI state). */
import { AMBIGUOUS_INPUT, EVM, SOLANA, TX } from './ids';

export const DEMO_EXAMPLES = [
  { label: 'Low risk wallet', query: EVM.low },
  { label: 'Contract with disclosures', query: EVM.contractWithDisclosures },
  { label: 'High risk wallet', query: EVM.high },
  { label: 'Severe, under appeal', query: EVM.severeUnderAppeal },
  { label: 'Suspended finding', query: EVM.suspended },
  { label: 'Not assessed', query: EVM.notAssessed },
  { label: 'Lookalike token (Solana)', query: SOLANA.lookalikeToken },
  { label: 'Ethereum transaction', query: TX.ethereum },
  { label: 'Pending Solana transaction', query: TX.solana },
  { label: 'Choose network', query: AMBIGUOUS_INPUT },
  { label: 'Not found', query: '0xb1ac00000000000000000000000000000000abcd' },
  { label: 'Provider unavailable', query: EVM.providerUnavailable },
  { label: 'Error state', query: EVM.error },
  { label: 'Unsupported network', query: 'example.eth' },
  { label: 'Invalid identifier', query: '0x12345' },
] as const;
