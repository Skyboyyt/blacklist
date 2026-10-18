import {
  addressResearchSchema,
  transactionResearchSchema,
  formatTokenAmount,
  NATIVE_CURRENCY,
  type ChainSlugDto,
} from '@blacklist/contracts';
import {
  readResearchAddress,
  readResearchTransaction,
  publicFindings,
  publicRedress,
  publicAssessment,
  publicLabels,
  publicSuppressions,
  feedChainAnalysis,
  type ResearchReadOptions,
  type ResearchContext,
  type Actor,
} from '@blacklist/domain';
import { publicResearchSource, publicResearchProvenance } from './source.ts';
import { capabilityDisclosures } from './disclosures.ts';

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
  publicBands = false,
) {
  const read = await readResearchAddress(ctx, actor, chain, input, options);
  if (!read.result.ok) return unavailable(read.result.error.kind);
  const { data, provenance } = read.result.value;
  if (!data) return { kind: 'not_found' as const };
  // Automatic analysis signals first, so the assessment below already reflects them (ADR 0021).
  await feedChainAnalysis(ctx, actor, chain, data);
  // Published moderator findings only (moderation §4.2); reports never appear here.
  const published = await publicFindings(ctx.runtime.db, read.ref.chainId, data.address);
  const redress = await publicRedress(
    ctx.runtime.db,
    published.subjectId,
    published.findings.map((f) => f.id),
  );
  const disputeState = published.suspended
    ? ('suspended_pending_review' as const)
    : published.findings.some((f) => redress.underAppeal.has(f.id))
      ? ('under_appeal' as const)
      : ('none' as const);
  const suppressions = await publicSuppressions(ctx.runtime.db, published.subjectId);
  const assessment = await publicAssessment(ctx.runtime.db, published.subjectId, {
    publicBands,
    disputeState,
    suppressions: suppressions.active,
  });
  const labels = await publicLabels(ctx.runtime.db, published.subjectId);
  const findings = published.findings.map((f) =>
    redress.underAppeal.has(f.id) ? { ...f, disputeState: 'under_appeal' as const } : f,
  );
  const disclosures = await capabilityDisclosures(ctx, actor, chain, data.address, data.kind, options);
  const at = provenance.fetchedAt.toISOString();
  const adapter = ctx.chains.adapterFor(read.ref.chainId);
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
      displayAddress: adapter.formatAddress(data.address),
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
        assessment: publicBands ? 'available' : 'unavailable',
        findings: 'available',
        labels: 'available',
        responses: 'available',
        transfers: 'unavailable',
        evidence: 'unavailable',
        history: 'available',
        disclosures: disclosures.available ? 'available' : 'unavailable',
      },
      assessment,
      facts: [
        {
          id: 'native-balance',
          label: 'Native balance',
          value: `${formatTokenAmount(data.nativeBalanceRaw, NATIVE_CURRENCY[chain].decimals)} ${NATIVE_CURRENCY[chain].symbol}`,
          provenance: 'chain_fact',
          finality: provenance.finality,
          source: publicResearchSource(chain, provenance),
          observedAt: at,
        },
        {
          id: 'native-balance-raw',
          label: chain === 'ethereum' ? 'Native balance (wei)' : 'Native balance (lamports)',
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
        // EIP-7702: the wallet runs this contract's code. Often a victim of a drainer, never a verdict.
        ...(data.delegateAddress
          ? [
              {
                id: 'eip7702-delegate',
                label: 'Delegated code (EIP-7702)',
                value: adapter.formatAddress(data.delegateAddress),
                provenance: 'chain_fact' as const,
                finality: provenance.finality,
                source: publicResearchSource(chain, provenance),
                observedAt: at,
              },
            ]
          : []),
      ],
      disclosures: disclosures.items,
      labels,
      findings,
      responses: redress.responses,
      transfers: [],
      evidence: [],
      timeline: [...published.timeline, ...redress.timeline, ...suppressions.timeline].sort((a, b) =>
        a.at.localeCompare(b.at),
      ),
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
