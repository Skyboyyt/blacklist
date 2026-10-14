// Bounded, read-only O-3 evaluation. Does not enable runtime flags, touch DB or deploy.
import { createRequire } from 'node:module';
const { z } = createRequire(new URL('../packages/chains/package.json', import.meta.url))('zod');
import {
  createRpcTransport,
  budgetedTransport,
  createEvmRpcSource,
  createSolanaRpcSource,
  registry,
  evmAdapter,
  solanaAdapter,
} from '../packages/chains/src/index.ts';

if (!process.env.ALCHEMY_ETHEREUM_API_KEY || !process.env.HELIUS_RPC_API_KEY) {
  console.log(JSON.stringify({ status: 'blocked', reason: 'protected_provider_keys_missing' }));
  process.exit(2);
}
let failures = 0;
const report = (chain, check, status, metadata = {}) =>
  console.log(JSON.stringify({ chain, check, status, ...metadata }));
const build = (url) => {
  const raw = createRpcTransport(url);
  let attempts = 0;
  const counted = {
    call: (...args) => {
      ++attempts;
      return raw.call(...args);
    },
  };
  return {
    rpc: budgetedTransport(counted, { perMinute: 30, total: 40, concurrency: 2 }),
    attempts: () => attempts,
  };
};
const ethereum = build(
  'https://eth-mainnet.g.alchemy.com/v2/' + encodeURIComponent(process.env.ALCHEMY_ETHEREUM_API_KEY),
);
const solana = build(
  'https://mainnet.helius-rpc.com/?api-key=' + encodeURIComponent(process.env.HELIUS_RPC_API_KEY),
);
const sources = {
  // Evaluation of enhanced method access only; not a Free-plan/terms or archive guarantee.
  ethereum: createEvmRpcSource('alchemy-eth-mainnet', 'unknown-upstream', ethereum.rpc, false, true),
  solana: createSolanaRpcSource('helius-sol-mainnet', 'unknown-upstream', solana.rpc),
};
const addresses = {
  ethereum: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
  solana: '11111111111111111111111111111111',
};
for (const slug of ['ethereum', 'solana']) {
  const source = sources[slug],
    adapter = slug === 'ethereum' ? evmAdapter : solanaAdapter;
  const chain = registry.bySlug(slug),
    address = adapter.parseAddress(addresses[slug]);
  if (!chain || !address) throw new Error('fixed_public_input_invalid');
  const ref = { chainId: chain.chainId, address };
  const options = { commitment: 'finalized', signal: AbortSignal.timeout(60000) };
  // Public v0 signature observed and verified during the initial mainnet probe.
  // Current history can include newer transaction versions that the V1 decoder does not support.
  let hash =
    slug === 'solana'
      ? (process.argv[2] ??
        '2Hw9CPrHCjv55quTzBJTMvPBf58FPksXK6g3rpJ5X5jwvtEedFJUZNT3jdmyCXCVeaFWc8rcmYhwWZQZaXKNdYeS')
      : undefined;
  for (const check of ['account', 'history_first_page', 'history_next_page', 'transaction']) {
    try {
      if (check === 'account') {
        const result = await source.fetchAccountInfo(ref, options);
        if (!result.data || !/^\d+$/u.test(result.data.nativeBalanceRaw))
          throw new Error('public_account_unavailable');
        report(slug, check, 'passed', {
          snapshot: result.provenance.snapshot,
          finality: result.provenance.finality,
          verification: result.provenance.verification,
          integerBalance: true,
        });
      } else if (check.startsWith('history')) {
        const cursor = check === 'history_next_page' ? source.nextEvaluationCursor : null;
        if (check === 'history_next_page' && !cursor) {
          report(slug, check, 'untested', { reason: 'no_next_page' });
          continue;
        }
        const result = await source.fetchAddressHistory(
          ref,
          { cursor, limit: 1, direction: slug === 'ethereum' ? 'out' : 'all' },
          options,
        );
        source.nextEvaluationCursor = result.data.nextCursor;
        hash ??= result.data.items[0]?.txHash;
        report(slug, check, 'passed', {
          count: result.data.items.length,
          hasNextPage: Boolean(result.data.nextCursor),
          snapshot: result.provenance.snapshot,
          finality: result.provenance.finality,
          coverage: result.data.coverage,
        });
      } else {
        if (!hash) {
          report(slug, check, 'untested', { reason: 'no_public_transaction_from_history' });
          continue;
        }
        const result = await source.fetchTransaction({ chainId: chain.chainId, txHash: hash }, options);
        if (!result.data) throw new Error('public_transaction_unavailable');
        report(slug, check, 'passed', {
          publicTransaction: hash,
          snapshot: result.provenance.snapshot,
          finality: result.provenance.finality,
          executionStatus: result.data.status,
          timestamp: result.data.blockTime?.toISOString(),
          integerFee: /^\d+$/u.test(result.data.feeRaw),
          transferCount: result.data.transfers.length,
          receiptCount: result.provenance.receipts?.length ?? 0,
        });
        if (slug === 'solana' && result.data.signers[0]) {
          // A public transaction signer is an address, not a claim about its owner or intent.
          const wallet = await source.fetchAccountInfo(
            { chainId: chain.chainId, address: result.data.signers[0] },
            options,
          );
          if (!wallet.data || !/^\d+$/u.test(wallet.data.nativeBalanceRaw))
            throw new Error('public_wallet_unavailable');
          report(slug, 'public_signer_account', 'passed', {
            snapshot: wallet.provenance.snapshot,
            integerBalance: true,
            accountKind: wallet.data.kind,
          });
        }
      }
    } catch (error) {
      ++failures;
      report(slug, check, 'failed', {
        reason: error?.kind ?? 'safe_evaluation_failure',
        ...(check === 'transaction' ? { publicTransaction: hash } : {}),
      });
    }
  }
}
try {
  const slot = await solana.rpc.call(
    'getSlot',
    [{ commitment: 'finalized' }],
    z.number().int().nonnegative().safe(),
  );
  report('solana', 'current_finalized_slot', 'passed', { slot });
} catch (error) {
  ++failures;
  report('solana', 'current_finalized_slot', 'failed', { reason: error?.kind ?? 'safe_evaluation_failure' });
}
console.log(
  JSON.stringify({
    evaluationOnly: true,
    attempts: { ethereum: ethereum.attempts(), solana: solana.attempts() },
    runtimeActivated: false,
    independenceVerified: false,
    planTermsVerified: false,
  }),
);
process.exitCode = failures ? 1 : 0;
