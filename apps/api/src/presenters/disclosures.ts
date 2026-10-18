import type { ChainSlugDto, Disclosure } from '@blacklist/contracts';
import {
  readResearchToken,
  readResearchContract,
  type ResearchContext,
  type ResearchReadOptions,
  type Actor,
} from '@blacklist/domain';
import { publicResearchSource } from './source.ts';

const PROXY_NAME = {
  eip1967: 'a standard EIP-1967 proxy',
  eip1822: 'an EIP-1822 proxy',
  beacon: 'a standard beacon proxy',
  other: 'an older ZeppelinOS-style proxy',
} as const;

/**
 * Capability disclosures read automatically from the chain (ADR 0005 item 4). They are
 * context only: zero contribution, never risk factors, and a single provider is enough
 * because nothing scores them (chain-data §5.5). `available: false` means the page must
 * not claim "no disclosures": the capability could not be read.
 */
export async function capabilityDisclosures(
  ctx: ResearchContext,
  actor: Actor | null,
  chain: ChainSlugDto,
  address: string,
  kind: string,
  options: ResearchReadOptions,
): Promise<{ available: boolean; items: Disclosure[] }> {
  // Plain wallets carry no code, so there is no capability to disclose.
  if (kind === 'eoa' || kind === 'eoa_delegated') return { available: true, items: [] };
  if (chain === 'solana' && kind === 'token_mint') {
    const read = await readResearchToken(ctx, actor, chain, address, options);
    if (!read.result.ok || !read.result.value.data) return { available: false, items: [] };
    const { data, provenance } = read.result.value,
      base = {
        provenance: 'chain_fact' as const,
        source: publicResearchSource(chain, provenance),
        observedAt: provenance.fetchedAt.toISOString(),
      },
      items: Disclosure[] = [];
    if (data.mintAuthority)
      items.push({
        ...base,
        id: 'mint-authority',
        code: 'mint_authority',
        label: 'Mint authority is active',
        explanation: `The address ${data.mintAuthority} can create new tokens, which increases the supply held by others. Many legitimate tokens keep this.`,
      });
    if (data.freezeAuthority)
      items.push({
        ...base,
        id: 'freeze-authority',
        code: 'freeze_authority',
        label: 'Freeze authority is active',
        explanation: `The address ${data.freezeAuthority} can freeze holders' token accounts so they cannot move their tokens. Regulated stablecoins commonly keep this.`,
      });
    return { available: true, items };
  }
  if (chain === 'ethereum' && kind === 'contract') {
    const read = await readResearchContract(ctx, actor, chain, address, options);
    if (!read.result.ok || !read.result.value.data) return { available: false, items: [] };
    const { data, provenance } = read.result.value;
    if (data.proxyType === 'none' || data.proxyType === null) return { available: true, items: [] };
    const control = data.admin ? ` The upgrade admin recorded on chain is ${data.admin}.` : '';
    return {
      available: true,
      items: [
        {
          id: 'upgradeable-proxy',
          code: 'upgradeable_proxy',
          label: 'Upgradeable contract',
          explanation: `This is ${PROXY_NAME[data.proxyType]}: the code it runs can be replaced by whoever controls upgrades.${control} Many legitimate projects use upgradeable contracts.`,
          provenance: 'chain_fact',
          source: publicResearchSource(chain, provenance),
          observedAt: provenance.fetchedAt.toISOString(),
        },
      ],
    };
  }
  // Programs, token accounts and unknown kinds: capabilities are not read in V1.
  return { available: false, items: [] };
}
