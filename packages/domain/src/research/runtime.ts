import type { DatabaseRuntime } from '@blacklist/db';
import type { ApiConfig } from '@blacklist/config';
import {
  createChainDataService,
  createRpcTransport,
  createEvmRpcSource,
  createSolanaRpcSource,
  budgetedTransport,
  retryingTransport,
} from '@blacklist/chains';
import type { ResearchContext } from './service.ts';
export function createResearch(runtime: DatabaseRuntime, config: ApiConfig): ResearchContext | undefined {
  if (config.RESEARCH_ENABLED !== 'true') return undefined;
  if (!config.ALCHEMY_ETHEREUM_API_KEY || !config.HELIUS_RPC_API_KEY || config.RPC_PLAN_VERIFIED !== 'true')
    throw new Error('research_configuration_unverified');
  const limits = {
    perMinute: config.RPC_API_REQUESTS_PER_MINUTE,
    total: config.RPC_API_TOTAL_REQUEST_BUDGET,
    totalWindowMs: config.RPC_API_BUDGET_WINDOW_HOURS * 60 * 60 * 1000,
    concurrency: 4,
  };
  const ethereum = retryingTransport(
    budgetedTransport(
      createRpcTransport(
        `https://eth-mainnet.g.alchemy.com/v2/${encodeURIComponent(config.ALCHEMY_ETHEREUM_API_KEY)}`,
      ),
      limits,
    ),
  );
  // A documented independent secondary turns on cross-verification (ADR 0021). Without it,
  // Alchemy stays `unknown-upstream` and nothing can be confirmed by a second provider.
  const infura = config.INFURA_ETHEREUM_API_KEY
    ? retryingTransport(
        budgetedTransport(
          createRpcTransport(
            `https://mainnet.infura.io/v3/${encodeURIComponent(config.INFURA_ETHEREUM_API_KEY)}`,
          ),
          limits,
        ),
      )
    : null;
  const solana = retryingTransport(
    budgetedTransport(
      createRpcTransport(
        `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(config.HELIUS_RPC_API_KEY)}`,
      ),
      limits,
    ),
  );
  return {
    runtime,
    chains: createChainDataService([
      createEvmRpcSource(
        'alchemy-ethereum',
        infura ? 'alchemy' : 'unknown-upstream',
        ethereum,
        false,
        config.ALCHEMY_INDEXED_HISTORY_VERIFIED === 'true',
        config.ALCHEMY_TOKEN_BALANCES_VERIFIED === 'true',
      ),
      ...(infura ? [createEvmRpcSource('infura-ethereum', 'infura', infura)] : []),
      createSolanaRpcSource('helius-solana', 'unknown-upstream', solana),
    ]),
  };
}
