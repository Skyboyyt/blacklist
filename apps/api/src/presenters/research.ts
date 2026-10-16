import { addressResearchSchema, transactionResearchSchema, type ChainSlugDto } from '@blacklist/contracts';
import {
  readResearchAddress,
  readResearchTransaction,
  publicFindings,
  type ResearchReadOptions,
  type ResearchContext,
  type Actor,
} from '@blacklist/domain';
import { publicResearchSource, publicResearchProvenance } from './source.ts';

const unavailable = (kind: string) => ({
  kind: 'provider_unavailable' as const,
  retryAfterSeconds: 30,
  reason:
    kind === 'data_conflict'
      ? ('under_verification' as const)
      : ['rate_limited', 'history_pruned', 'not_supported', 'timeout'].includes(kind)
        ? kind
        : 'unavailable',
});
export async function addressResearch(
  ctx: ResearchContext,
  actor: Actor | null,
  chain: ChainSlugDto,
  input: string,
  options: ResearchReadOptions = {},
) {
  const read = await readResearchAddress(ctx, actor, chain, input, options);
  if (!read.result.ok) return unavailable(read.result.error.kind);
  const { data, provenance } = read.result.value;
  if (!data) return { kind: 'not_found' as const };
  // Published moderator findings only (moderation §4.2); reports never appear here.
  const published = await publicFindings(ctx.runtime.db, read.ref.chainId, data.address);
  const at = provenance.fetchedAt.toISOString();
  const snapshot =
    provenance.snapshot.kind === 'evm_block'
      ? `Block ${provenance.snapshot.blockNumber}`
      : provenance.snapshot.kind === 'solana_context'
        ? `Context slot ${provenance.snapshot.contextSlot}`
        : `Slot ${provenance.snapshot.slot}`;
  return {
    kind: 'found' as const,
    data: addressResearchSchema.parse({
      chain,
      provenance: publicResearchProvenance(chain, provenance),
      degraded: provenance.degraded,
      address: data.address,
      displayAddress: ctx.chains.adapterFor(read.ref.chainId).formatAddress(data.address),
      kind:
        data.kind === 'contract' || data.kind === 'program'
          ? 'contract'
          : data.kind === 'token_mint'
            ? 'token'
            : data.kind === 'eoa' || data.kind === 'eoa_delegated'
              ? 'wallet'
              : 'unknown',
      untrustedLabel: null,
      availability: {
        assessment: 'unavailable',
        findings: 'available',
        labels: 'unavailable',
        responses: 'unavailable',
        transfers: 'unavailable',
        evidence: 'unavailable',
        history: 'available',
        disclosures: 'unavailable',
      },
      assessment: {
        band: 'not_assessed',
        explanation: 'Risk assessment is not available. Blockchain data alone is not an assessment.',
        factors: [],
        confidence: 'low',
        coverage:
          'Chain account data and published moderator findings. Evidence, responses and risk assessment are not connected.',
        asOf: at,
        rulesetVersion: 'unavailable',
        disputeState: 'none',
        suppressions: [],
      },
      facts: [
        {
          id: 'native-balance',
          label: 'Native balance (raw base units)',
          value: data.nativeBalanceRaw,
          provenance: 'chain_fact',
          finality: provenance.finality,
          source: publicResearchSource(chain, provenance),
          observedAt: at,
        },
        {
          id: 'snapshot',
          label: 'Snapshot',
          value: snapshot,
          provenance: 'chain_fact',
          finality: provenance.finality,
          source: publicResearchSource(chain, provenance),
          observedAt: at,
        },
      ],
      disclosures: [],
      labels: [],
      findings: published.findings,
      responses: [],
      transfers: [],
      evidence: [],
      timeline: published.timeline,
    }),
  };
}
export async function transactionResearch(
  ctx: ResearchContext,
  actor: Actor | null,
  chain: ChainSlugDto,
  input: string,
  options: ResearchReadOptions = {},
) {
  const read = await readResearchTransaction(ctx, actor, chain, input, options);
  if (!read.result.ok) return unavailable(read.result.error.kind);
  const { data, provenance } = read.result.value;
  if (!data) return { kind: 'not_found' as const };
  if (data.block === null || data.blockTime === null || !data.signers[0] || data.feeRaw === null)
    return unavailable('unavailable');
  return {
    kind: 'found' as const,
    data: transactionResearchSchema.parse({
      chain,
      degraded: provenance.degraded,
      hash: data.txHash,
      provenance: publicResearchProvenance(chain, provenance),
      finality: provenance.finality,
      blockOrSlot: data.block,
      at: data.blockTime.toISOString(),
      from: data.signers[0],
      to: chain === 'ethereum' ? (data.invoked[0] ?? null) : null,
      feePaid: `${data.feeRaw} ${chain === 'ethereum' ? 'wei' : 'lamports'}`,
      status: data.status,
      transferCoverage: 'incomplete',
      transfers: data.transfers.map((t) => ({
        id: t.ordinal,
        from: t.from,
        to: t.to,
        authority: t.authority,
        direction: 'out',
        counterparty: t.to,
        amount: t.amountRaw,
        assetSymbol: t.asset.kind === 'native' ? read.chain.nativeSymbol : t.asset.address,
        assetVerified: false,
        evidenceLevel: t.evidenceLevel,
        authorization: t.authorization,
        tier: 'observed',
        txHash: data.txHash,
        at: data.blockTime?.toISOString(),
      })),
      facts: [
        {
          id: 'snapshot',
          label: 'Included in',
          value: `${chain === 'ethereum' ? 'Block' : 'Slot'} ${data.block}`,
          provenance: 'chain_fact',
          finality: provenance.finality,
          source: publicResearchSource(chain, provenance),
          observedAt: provenance.fetchedAt.toISOString(),
        },
      ],
    }),
  };
}
