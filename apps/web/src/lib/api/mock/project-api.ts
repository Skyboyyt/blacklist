/**
 * Mock project directory and profiles (development and tests only; never in
 * production builds). Pure functions over fixtures, so behaviour is deterministic.
 *
 * Search rules mirror the contract: an address query is matched on the selected
 * network only and is never guessed across networks; a text query matches names and
 * official domains. Matching a name never identifies a project on its own: results
 * always show official identifiers.
 */
import {
  PROJECT_DIRECTORY_PAGE_SIZE,
  projectDetailSchema,
  projectDirectoryResponseSchema,
  type AddressResearch,
  type ChainSlugDto,
  type DisputeState,
  type ProjectDetail,
  type ProjectDirectoryQuery,
  type ProjectDirectoryResponse,
  type ProjectSummary,
} from '@blacklist/contracts';
import { classifyInput } from '@/lib/search/classify';
import type { ResearchResult } from '../types';
import {
  PROJECT_FIXTURES,
  PROJECT_SPECIAL_QUERIES,
  PROJECT_SPECIAL_SLUGS,
  type ProjectFixture,
} from './fixtures/projects';

const UNAVAILABLE = { kind: 'provider_unavailable', retryAfterSeconds: 30 } as const;
const DISPUTE_RANK: Record<DisputeState, number> = { none: 0, under_appeal: 1, suspended_pending_review: 2 };
const NETWORK_NAMES = { ethereum: 'Ethereum', solana: 'Solana' } as const;

export function createProjectCatalog(addresses: readonly AddressResearch[]) {
  const findAddress = (chain: ChainSlugDto, address: string) =>
    addresses.find((a) => a.chain === chain && a.address === address);

  function compose(fixture: ProjectFixture): ProjectDetail {
    const officialAddresses = fixture.addresses.map((ref) => {
      const research = findAddress(ref.chain, ref.address);
      return {
        chain: ref.chain,
        address: ref.address,
        displayAddress: research?.displayAddress ?? ref.address,
        role: ref.role,
        basis: ref.basis,
        basisNote: ref.basisNote,
        attributedAt: ref.attributedAt,
        assessment: ref.assessmentUnavailable ? null : (research?.assessment ?? null),
        disclosures: research?.disclosures ?? [],
      };
    });
    const findings = fixture.addresses.flatMap((ref) => findAddress(ref.chain, ref.address)?.findings ?? []);
    return projectDetailSchema.parse({
      slug: fixture.slug,
      name: fixture.name,
      category: fixture.category,
      description: fixture.description,
      officialAddresses,
      domains: fixture.domains,
      findings,
      responses: fixture.responses,
      history: fixture.history,
      profileRevision: fixture.profileRevision,
      lastReviewedAt: fixture.lastReviewedAt,
      updatedAt: fixture.updatedAt,
      freshness: fixture.freshness,
    });
  }

  const details = PROJECT_FIXTURES.map(compose);

  /** With a selected network, the card's identifier is on that network. */
  function summarize(d: ProjectDetail, chain: ChainSlugDto | undefined): ProjectSummary {
    const first = d.officialAddresses.find((a) => !chain || a.chain === chain);
    const disputeState = d.findings.reduce<DisputeState>(
      (worst, f) => (DISPUTE_RANK[f.disputeState] > DISPUTE_RANK[worst] ? f.disputeState : worst),
      'none',
    );
    return {
      slug: d.slug,
      name: d.name,
      category: d.category,
      networks: [...new Set(d.officialAddresses.map((a) => a.chain))],
      primaryIdentifier: first
        ? { chain: first.chain, address: first.address, displayAddress: first.displayAddress }
        : null,
      officialAddressCount: d.officialAddresses.length,
      publishedFindingCount: d.findings.length,
      disputeState,
      lastReviewedAt: d.lastReviewedAt,
      freshness: d.freshness.state,
    };
  }

  /** Narrows by query. Returns a response for queries that cannot be answered as a list. */
  function matchQuery(
    all: readonly ProjectDetail[],
    query: string | undefined,
    chain: ChainSlugDto | undefined,
  ): readonly ProjectDetail[] | ProjectDirectoryResponse {
    const q = query?.trim() ?? '';
    if (q === '') return all;
    const c = classifyInput(q);
    if (c.kind === 'transaction') {
      return { kind: 'invalid_query', reason: 'That is a transaction hash. Look it up in Research instead.' };
    }
    if (c.kind === 'address' || c.kind === 'ambiguous_address') {
      if (!chain) return { kind: 'choose_network' };
      const normalized =
        c.kind === 'address' ? c.normalized : chain === 'ethereum' ? `0x${q.toLowerCase()}` : q;
      const valid = c.kind === 'address' ? c.chains.includes(chain) : c.candidates.includes(chain);
      if (!valid)
        return { kind: 'invalid_query', reason: `This is not a valid ${NETWORK_NAMES[chain]} address.` };
      return all.filter((d) =>
        d.officialAddresses.some((a) => a.chain === chain && a.address === normalized),
      );
    }
    const needle = q.toLowerCase();
    return all.filter(
      (d) => d.name.toLowerCase().includes(needle) || d.domains.some((dom) => dom.hostname.includes(needle)),
    );
  }

  function list(request: ProjectDirectoryQuery): ProjectDirectoryResponse {
    if (request.query === PROJECT_SPECIAL_QUERIES.unavailable) return UNAVAILABLE;
    if (request.query === PROJECT_SPECIAL_QUERIES.error)
      throw new Error('Mock failure for the error-state fixture.');
    if (details.length === 0) return { kind: 'empty_directory' };

    const matched = matchQuery(details, request.query, request.chain);
    if (!Array.isArray(matched)) return projectDirectoryResponseSchema.parse(matched);

    const summaries = (matched as readonly ProjectDetail[])
      .filter((d) => !request.chain || d.officialAddresses.some((a) => a.chain === request.chain))
      .filter((d) => !request.category || d.category === request.category)
      .map((d) => summarize(d, request.chain))
      .filter((s) => {
        switch (request.findings) {
          case 'any':
            return true;
          case 'with_findings':
            return s.publishedFindingCount > 0;
          case 'without_findings':
            return s.publishedFindingCount === 0;
          case 'disputed':
            return s.disputeState !== 'none';
        }
      })
      .sort((a, b) => {
        const byName = a.name.localeCompare(b.name, 'en');
        if (request.sort === 'recently_reviewed')
          return b.lastReviewedAt.localeCompare(a.lastReviewedAt) || byName;
        if (request.sort === 'most_findings')
          return b.publishedFindingCount - a.publishedFindingCount || byName;
        return byName;
      });

    if (summaries.length === 0) return { kind: 'no_results' };
    const totalPages = Math.ceil(summaries.length / PROJECT_DIRECTORY_PAGE_SIZE);
    const page = Math.min(request.page, totalPages);
    const start = (page - 1) * PROJECT_DIRECTORY_PAGE_SIZE;
    return projectDirectoryResponseSchema.parse({
      kind: 'results',
      items: summaries.slice(start, start + PROJECT_DIRECTORY_PAGE_SIZE),
      page,
      pageSize: PROJECT_DIRECTORY_PAGE_SIZE,
      totalItems: summaries.length,
      totalPages,
    });
  }

  function get(slug: string): ResearchResult<ProjectDetail> {
    if (slug === PROJECT_SPECIAL_SLUGS.unavailable) return UNAVAILABLE;
    if (slug === PROJECT_SPECIAL_SLUGS.error) throw new Error('Mock failure for the error-state fixture.');
    const found = details.find((d) => d.slug === slug);
    return found ? { kind: 'found', data: found } : { kind: 'not_found' };
  }

  return { list, get, details };
}
