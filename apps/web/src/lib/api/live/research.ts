import 'server-only';
import { cookies, headers } from 'next/headers';
import {
  addressResearchSchema,
  transactionResearchSchema,
  researchResultSchema,
  searchResponseSchema,
  addressHistorySchema,
  tokenResearchSchema,
  contractResearchSchema,
  tokenBalancesSchema,
  type ChainSlugDto,
  type SearchRequest,
} from '@blacklist/contracts';
import type { z } from 'zod';
import type { ResearchApi } from '../types';
import { notConnectedResearchApi } from '../not-connected';
import { getLiveViewer } from './server-viewer';
import { stagingAccessHeaders } from '../../security/staging-gateway';
import { ssrClientIpHeaders } from '../../security/client-ip';
import { allowedInternalUrl } from '../../security/internal-url';
async function read<S extends z.ZodType>(path: string, schema: S): Promise<z.output<S>> {
  const base = process.env['API_INTERNAL_URL'],
    token = process.env['INTERNAL_API_TOKEN'];
  if (!base || !token) throw new Error('research_unavailable');
  const url = new URL('/api/internal/v1' + path, base);
  if (!allowedInternalUrl(url)) throw new Error('research_unavailable');
  const jar = await cookies(),
    cookie = jar.get('__Host-bl_session')?.value;
  if (cookie && (!/^[A-Za-z0-9._%+\-/=]+$/u.test(cookie) || cookie.length > 2048))
    throw new Error('research_unavailable');
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
    headers: {
      ...stagingAccessHeaders(),
      ...ssrClientIpHeaders(await headers()),
      'x-bl-internal-token': token,
      ...(cookie ? { cookie: `__Host-bl_session=${cookie}` } : {}),
    },
  });
  if (!response.ok) throw new Error('research_unavailable');
  return schema.parse(await response.json());
}
const unavailable = { kind: 'provider_unavailable' as const, retryAfterSeconds: 30 };
export const liveResearchApi: ResearchApi = {
  ...notConnectedResearchApi,
  getViewer: getLiveViewer,
  async search(input: SearchRequest) {
    const params = new URLSearchParams({
      query: input.query,
      ...(input.chain ? { chain: input.chain } : {}),
    });
    try {
      return await read('/search?' + params.toString(), searchResponseSchema);
    } catch {
      return unavailable;
    }
  },
  async getAddressResearch(chain: ChainSlugDto, address: string) {
    try {
      return await read(
        `/addresses/${chain}/${encodeURIComponent(address)}`,
        researchResultSchema(addressResearchSchema),
      );
    } catch {
      return unavailable;
    }
  },
  async getTransactionResearch(chain: ChainSlugDto, hash: string) {
    try {
      return await read(
        `/transactions/${chain}/${encodeURIComponent(hash)}`,
        researchResultSchema(transactionResearchSchema),
      );
    } catch {
      return unavailable;
    }
  },
  async getAddressHistory(chain, address, query) {
    try {
      const params = new URLSearchParams({
        limit: '20',
        direction: query.direction,
        ...(query.cursor ? { cursor: query.cursor } : {}),
      });
      return await read(
        `/addresses/${chain}/${encodeURIComponent(address)}/transactions?${params}`,
        researchResultSchema(addressHistorySchema),
      );
    } catch {
      return unavailable;
    }
  },
  async getTokenResearch(chain, address) {
    try {
      return await read(
        `/addresses/${chain}/${encodeURIComponent(address)}/token`,
        researchResultSchema(tokenResearchSchema),
      );
    } catch {
      return unavailable;
    }
  },
  async getContractResearch(chain, address) {
    try {
      return await read(
        `/addresses/${chain}/${encodeURIComponent(address)}/contract`,
        researchResultSchema(contractResearchSchema),
      );
    } catch {
      return unavailable;
    }
  },
  async getTokenBalances(chain, address) {
    try {
      return await read(
        `/addresses/${chain}/${encodeURIComponent(address)}/balances`,
        researchResultSchema(tokenBalancesSchema),
      );
    } catch {
      return unavailable;
    }
  },
};
