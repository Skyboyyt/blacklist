/**
 * URL ⇄ directory query. The URL is the source of truth, so filters work without
 * JavaScript, can be bookmarked and survive reloads. An unknown network is reported,
 * never dropped or replaced (review P1-06); other invalid values fall back to defaults.
 */
import {
  CHAIN_SLUGS,
  PROJECT_CATEGORIES,
  PROJECT_QUERY_MAX_LENGTH,
  projectFindingsFilterSchema,
  projectSortSchema,
  type ChainSlugDto,
  type ProjectCategory,
  type ProjectDirectoryQuery,
} from '@blacklist/contracts';

type Params = Readonly<Record<string, string | string[] | undefined>>;

export type DirectoryParams =
  | { readonly kind: 'query'; readonly query: ProjectDirectoryQuery }
  | { readonly kind: 'unsupported_network'; readonly network: string; readonly query: ProjectDirectoryQuery };

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return value !== undefined && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function parseDirectoryParams(params: Params): DirectoryParams {
  const q = single(params['q'])?.trim().slice(0, PROJECT_QUERY_MAX_LENGTH);
  const rawChain = single(params['chain']);
  const chain = oneOf<ChainSlugDto>(rawChain, CHAIN_SLUGS);
  const category = oneOf<ProjectCategory>(single(params['category']), PROJECT_CATEGORIES);
  const findings = projectFindingsFilterSchema.catch('any').parse(single(params['status']));
  const sort = projectSortSchema.catch('name').parse(single(params['sort']));
  const pageNumber = Number.parseInt(single(params['page']) ?? '1', 10);
  const page = Number.isFinite(pageNumber) && pageNumber >= 1 ? Math.min(pageNumber, 1000) : 1;

  const query: ProjectDirectoryQuery = {
    ...(q ? { query: q } : {}),
    ...(chain ? { chain } : {}),
    ...(category ? { category } : {}),
    findings,
    sort,
    page,
  };
  if (rawChain && rawChain !== '' && !chain) {
    return { kind: 'unsupported_network', network: rawChain.slice(0, 40), query };
  }
  return { kind: 'query', query };
}

/** Builds a directory URL, omitting defaults so links stay short and canonical. */
export function directoryHref(
  query: ProjectDirectoryQuery,
  overrides: Partial<ProjectDirectoryQuery> = {},
): string {
  const merged = { ...query, ...overrides };
  const search = new URLSearchParams();
  if (merged.query) search.set('q', merged.query);
  if (merged.chain) search.set('chain', merged.chain);
  if (merged.category) search.set('category', merged.category);
  if (merged.findings !== 'any') search.set('status', merged.findings);
  if (merged.sort !== 'name') search.set('sort', merged.sort);
  if (merged.page > 1) search.set('page', String(merged.page));
  const qs = search.toString();
  return qs ? `/projects?${qs}` : '/projects';
}
