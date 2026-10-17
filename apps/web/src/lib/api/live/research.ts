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
  projectDirectoryResponseSchema,
  projectDetailSchema,
  scoreboardResponseSchema,
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
// A free-tier API sleeps when idle and can take close to a minute to wake, while the
// provider read finishes and is cached on the API. One retry with a longer wait covers
// that; a definite answer (any 2xx, 4xx or bad body) is never retried.
const FIRST_WAIT_MS = 25_000;
const RETRY_WAIT_MS = 45_000;
const WAKING_STATUSES = new Set([502, 503, 504]);
class Retryable extends Error {}
async function read<S extends z.ZodType>(path: string, schema: S): Promise<z.output<S>> {
  try {
    return await attempt(path, schema, FIRST_WAIT_MS);
  } catch (error) {
    if (!(error instanceof Retryable)) throw error;
    return attempt(path, schema, RETRY_WAIT_MS);
  }
}
async function attempt<S extends z.ZodType>(path: string, schema: S, waitMs: number): Promise<z.output<S>> {
  const base = process.env['API_INTERNAL_URL'],
    token = process.env['INTERNAL_API_TOKEN'];
  if (!base || !token) throw new Error('research_unavailable');
  const url = new URL('/api/internal/v1' + path, base);
  if (!allowedInternalUrl(url)) throw new Error('research_unavailable');
  const jar = await cookies(),
    cookie = jar.get('__Host-bl_session')?.value;
  if (cookie && (!/^[A-Za-z0-9._%+\-/=]+$/u.test(cookie) || cookie.length > 2048))
    throw new Error('research_unavailable');
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(waitMs),
      headers: {
        ...stagingAccessHeaders(),
        ...ssrClientIpHeaders(await headers()),
        'x-bl-internal-token': token,
        ...(cookie ? { cookie: `__Host-bl_session=${cookie}` } : {}),
      },
    });
  } catch {
    // Timed out or could not connect: the API may be waking up.
    throw new Retryable('research_unavailable');
  }
  if (WAKING_STATUSES.has(response.status)) throw new Retryable('research_unavailable');
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
  async getAddressResearch(chain: ChainSlugDto, address: string, options = {}) {
    try {
      return await read(
        `/addresses/${chain}/${encodeURIComponent(address)}${options.finality === 'final' ? '?finality=final' : ''}`,
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
  // Project reads (Phase 10 slice 5). A failed directory or ranking read throws to the
  // route error boundary; a profile read reports "unavailable" like any research result.
  async listProjects(request) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(request))
      if (value !== undefined && value !== '') params.set(key, String(value));
    return read(`/projects?${params}`, projectDirectoryResponseSchema);
  },
  async getProject(slug) {
    try {
      return await read(`/projects/${encodeURIComponent(slug)}`, researchResultSchema(projectDetailSchema));
    } catch {
      return unavailable;
    }
  },
  async getScoreboard(request) {
    return read(
      `/projects/scoreboard${request.chain ? `?chain=${request.chain}` : ''}`,
      scoreboardResponseSchema,
    );
  },
};
