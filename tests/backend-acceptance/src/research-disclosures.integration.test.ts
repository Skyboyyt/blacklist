import { randomBytes } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { z } from 'zod';
import { createServer } from '@blacklist/api';
import { readApiConfig } from '@blacklist/config';
import { addressResearchSchema, researchResultSchema } from '@blacklist/contracts';
import {
  createChainDataService,
  createEvmRpcSource,
  createSolanaRpcSource,
} from '../../../packages/chains/src/index.ts';
import { ProviderFault, type RpcTransport } from '../../../packages/chains/src/providers/rpc-transport.ts';
import { startApplicationFixture, fixtureUrl, type ApplicationFixture } from './application-fixture.ts';

// Automatic capability disclosures on the address page (ADR 0005 item 4): context only, never factors.
let f: ApplicationFixture;
beforeAll(async () => {
  f = await startApplicationFixture();
});
afterAll(async () => {
  if (f) await f.stop();
});
const block = { number: '0x10', hash: '0x' + 'a'.repeat(64), timestamp: '0x65000000' };
const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';
const empty = '0x' + '0'.repeat(64);
const holding = (hex: string) => '0x' + '0'.repeat(24) + hex.repeat(40);
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const MINT = 'So11111111111111111111111111111111111111112';
const AUTHORITY = 'Vote111111111111111111111111111111111111111';

interface Scenario {
  code?: string;
  slots?: Record<string, string>;
  storageFault?: ProviderFault;
  mintAuthority?: string | null;
  freezeAuthority?: string | null;
}
function appFor(s: Scenario) {
  const rpc: RpcTransport = {
    async call<S extends z.ZodType>(
      method: string,
      params: readonly unknown[],
      validator: S,
    ): Promise<z.output<S>> {
      let value: unknown;
      if (method === 'eth_chainId') value = '0x1';
      else if (method === 'eth_getBlockByNumber' || method === 'eth_getBlockByHash') value = block;
      else if (method === 'eth_getBalance') value = '0x2a';
      else if (method === 'eth_getCode') value = s.code ?? '0x';
      else if (method === 'eth_getStorageAt') {
        if (s.storageFault) throw s.storageFault;
        value = s.slots?.[String(params[1])] ?? empty;
      } else if (method === 'getGenesisHash') value = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
      else if (method === 'getAccountInfo')
        value = {
          context: { slot: 100 },
          value: {
            lamports: '1461600',
            owner: TOKEN_PROGRAM,
            executable: false,
            data: {
              program: 'spl-token',
              parsed: {
                type: 'mint',
                info: {
                  decimals: 9,
                  supply: '1000',
                  mintAuthority: s.mintAuthority ?? null,
                  freezeAuthority: s.freezeAuthority ?? null,
                },
              },
            },
          },
        };
      else throw new Error('fixture_unexpected_method');
      return validator.parse(value);
    },
  };
  const chains = createChainDataService([
    createEvmRpcSource('fixture-evm', 'unknown-upstream', rpc),
    createSolanaRpcSource('fixture-solana', 'unknown-upstream', rpc),
  ]);
  return createServer(
    f.ctx,
    readApiConfig({
      NODE_ENV: 'test',
      DATABASE_URL: fixtureUrl(f.h, 'runtime'),
      APP_ORIGIN: f.ctx.settings.origin,
      BETTER_AUTH_SECRET: f.ctx.settings.secret,
      INTERNAL_API_TOKEN: randomBytes(32).toString('hex'),
      WEBAUTHN_RP_ID: f.ctx.settings.rpId,
    }),
    false,
    { runtime: f.ctx.runtime, chains },
  );
}
async function research(s: Scenario, chain: 'ethereum' | 'solana', address: string) {
  const app = appFor(s);
  try {
    const result = researchResultSchema(addressResearchSchema).parse(
      (
        await app.inject({ method: 'GET', url: `/api/v1/addresses/${chain}/${address}?finality=final` })
      ).json(),
    );
    if (result.kind !== 'found') throw new Error('fixture_research_not_found');
    return result.data;
  } finally {
    await app.close();
  }
}
const evm = (n: string) => '0x' + n.repeat(40);

describe('automatic capability disclosures (zero contribution)', () => {
  it('discloses an EIP-1967 upgradeable contract with its admin, and nothing for a plain contract', async () => {
    const proxy = await research(
      { code: '0x6080', slots: { [IMPLEMENTATION_SLOT]: holding('3'), [ADMIN_SLOT]: holding('4') } },
      'ethereum',
      evm('1'),
    );
    expect(proxy.availability?.disclosures).toBe('available');
    expect(proxy.disclosures.map((d) => d.code)).toEqual(['upgradeable_proxy']);
    expect(proxy.disclosures[0]?.provenance).toBe('chain_fact');
    expect(proxy.disclosures[0]?.explanation).toContain('0x' + '4'.repeat(40));
    // Context only: never a risk factor, whatever the assessment state.
    expect(proxy.assessment.factors).toEqual([]);
    expect(proxy.assessment.band).toBe('not_assessed');

    // USDC-style ZeppelinOS proxy slots are disclosed too.
    const zos = await research(
      {
        code: '0x6080',
        slots: { '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3': holding('7') },
      },
      'ethereum',
      evm('2'),
    );
    expect(zos.disclosures.map((d) => d.code)).toEqual(['upgradeable_proxy']);
    expect(zos.disclosures[0]?.explanation).toContain('ZeppelinOS');

    const plain = await research({ code: '0x6080' }, 'ethereum', evm('1'));
    expect(plain.availability?.disclosures).toBe('available');
    expect(plain.disclosures).toEqual([]);
  });

  it('a wallet has nothing to disclose; an EIP-7702 delegation is shown as a neutral chain fact', async () => {
    const wallet = await research({}, 'ethereum', evm('5'));
    expect(wallet.availability?.disclosures).toBe('available');
    expect(wallet.disclosures).toEqual([]);
    expect(wallet.facts.some((x) => x.id === 'eip7702-delegate')).toBe(false);

    const delegated = await research({ code: '0xef0100' + '6'.repeat(40) }, 'ethereum', evm('5'));
    expect(delegated.kind).toBe('wallet');
    expect(delegated.disclosures).toEqual([]);
    const fact = delegated.facts.find((x) => x.id === 'eip7702-delegate');
    expect(fact?.provenance).toBe('chain_fact');
    expect(fact?.value.toLowerCase()).toBe(evm('6'));
  });

  it('a failed capability read leaves the page working and never claims "no disclosures"', async () => {
    const data = await research(
      { code: '0x6080', storageFault: new ProviderFault('rate_limited') },
      'ethereum',
      evm('1'),
    );
    expect(data.availability?.disclosures).toBe('unavailable');
    expect(data.disclosures).toEqual([]);
    expect(data.facts.length).toBeGreaterThan(0);
  });

  it('discloses active Solana mint and freeze authorities, and nothing when both are revoked', async () => {
    const active = await research({ mintAuthority: AUTHORITY, freezeAuthority: AUTHORITY }, 'solana', MINT);
    expect(active.kind).toBe('token');
    expect(active.availability?.disclosures).toBe('available');
    expect(active.disclosures.map((d) => d.code)).toEqual(['mint_authority', 'freeze_authority']);
    expect(active.disclosures.every((d) => d.explanation.includes(AUTHORITY))).toBe(true);
    expect(active.assessment.factors).toEqual([]);

    const revoked = await research({}, 'solana', MINT);
    expect(revoked.availability?.disclosures).toBe('available');
    expect(revoked.disclosures).toEqual([]);
  });
});
