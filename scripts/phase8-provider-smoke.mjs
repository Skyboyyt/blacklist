// Read-only approved-provider probes. No database, account, actor, deployment or mail access.
import {
  createRpcTransport,
  createEvmRpcSource,
  createSolanaRpcSource,
  createChainDataService,
  registry,
  evmAdapter,
  solanaAdapter,
  budgetedTransport,
} from '../packages/chains/src/index.ts';
const names = ['ALCHEMY_ETHEREUM_API_KEY', 'HELIUS_RPC_API_KEY'];
if (names.some((name) => !process.env[name])) {
  console.log(
    JSON.stringify({
      status: 'blocked',
      reason: 'provider_bindings_unavailable',
      missing: names.filter((name) => !process.env[name]),
    }),
  );
  process.exit(2);
}
if (process.env['RPC_PLAN_VERIFIED'] !== 'true') {
  console.log(JSON.stringify({ status: 'blocked', reason: 'actual_free_plan_and_terms_review_required' }));
  process.exit(2);
}
const build = (endpoint) =>
  budgetedTransport(createRpcTransport(endpoint), { perMinute: 30, total: 40, concurrency: 2 });
const source = createChainDataService([
  createEvmRpcSource(
    'alchemy-eth-mainnet',
    'unknown-upstream',
    build(
      'https://eth-mainnet.g.alchemy.com/v2/' + encodeURIComponent(process.env['ALCHEMY_ETHEREUM_API_KEY']),
    ),
  ),
  createSolanaRpcSource(
    'helius-sol-mainnet',
    'unknown-upstream',
    build('https://mainnet.helius-rpc.com/?api-key=' + encodeURIComponent(process.env['HELIUS_RPC_API_KEY'])),
  ),
]);
const inputs = {
  ethereum: { address: '0x0000000000000000000000000000000000000000', hash: process.argv[2] },
  solana: { address: '11111111111111111111111111111111', hash: process.argv[3] },
};
let failed = false,
  untested = 0;
for (const slug of ['ethereum', 'solana']) {
  const chain = registry.bySlug(slug),
    adapter = slug === 'ethereum' ? evmAdapter : solanaAdapter;
  if (!chain) throw new Error('registry_missing');
  const address = adapter.parseAddress(inputs[slug].address);
  if (!address) throw new Error('fixed_public_address_invalid');
  for (const capability of ['account', 'transaction']) {
    if (capability === 'transaction' && !inputs[slug].hash) {
      console.log(
        JSON.stringify({
          chain: slug,
          capability,
          status: 'untested',
          reason: 'public_transaction_identifier_required',
        }),
      );
      ++untested;
      continue;
    }
    try {
      const hash = capability === 'transaction' ? adapter.parseTxHash(inputs[slug].hash) : null;
      if (capability === 'transaction' && !hash) throw new Error('public_transaction_identifier_invalid');
      const result = hash
        ? await source.getTransaction({ chainId: chain.chainId, txHash: hash }, { minFinality: 'final' })
        : await source.getAccountInfo({ chainId: chain.chainId, address }, { minFinality: 'final' });
      if (!result.ok) {
        console.log(JSON.stringify({ chain: slug, capability, status: 'failed', reason: result.error.kind }));
        failed = true;
        continue;
      }
      const p = result.value.provenance;
      console.log(
        JSON.stringify({
          chain: slug,
          capability,
          status: result.value.data ? 'passed' : 'failed',
          snapshot: p.snapshot,
          finality: p.finality,
          verification: p.verification,
          receipts: p.receipts?.length ?? 0,
          fetchedAt: p.fetchedAt.toISOString(),
        }),
      );
      if (!result.value.data) failed = true;
    } catch {
      console.log(
        JSON.stringify({ chain: slug, capability, status: 'failed', reason: 'safe_probe_failure' }),
      );
      failed = true;
    }
  }
}
process.exitCode = failed ? 1 : untested ? 2 : 0;
