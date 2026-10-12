import { describe, expect, it } from 'vitest';
import { directoryHref, parseDirectoryParams } from './directory-params';

describe('project directory URL parameters', () => {
  it('uses defaults for an empty URL', () => {
    expect(parseDirectoryParams({})).toEqual({
      kind: 'query',
      query: { findings: 'any', sort: 'name', page: 1 },
    });
  });

  it('reads every filter and keeps the selected network', () => {
    const parsed = parseDirectoryParams({
      q: '  demo ',
      chain: 'solana',
      category: 'dao',
      status: 'disputed',
      sort: 'most_findings',
      page: '2',
    });
    expect(parsed).toEqual({
      kind: 'query',
      query: {
        query: 'demo',
        chain: 'solana',
        category: 'dao',
        findings: 'disputed',
        sort: 'most_findings',
        page: 2,
      },
    });
  });

  it('reports an unknown network instead of silently searching all networks (P1-06)', () => {
    const parsed = parseDirectoryParams({ chain: 'polygon', q: 'demo' });
    expect(parsed.kind).toBe('unsupported_network');
    expect(parsed.query.chain).toBeUndefined();
  });

  it('falls back to defaults for invalid filters and pages', () => {
    const parsed = parseDirectoryParams({
      status: 'verified',
      sort: 'score',
      page: '-3',
      category: 'casino',
    });
    expect(parsed.query).toEqual({ findings: 'any', sort: 'name', page: 1 });
    expect(parseDirectoryParams({ page: 'abc' }).query.page).toBe(1);
    expect(parseDirectoryParams({ page: ['1', '2'] }).query.page).toBe(1);
  });

  it('builds canonical links that keep filters and omit defaults', () => {
    const query = {
      query: 'demo',
      chain: 'ethereum',
      findings: 'with_findings',
      sort: 'name',
      page: 1,
    } as const;
    expect(directoryHref(query, { page: 2 })).toBe(
      '/projects?q=demo&chain=ethereum&status=with_findings&page=2',
    );
    expect(directoryHref({ findings: 'any', sort: 'name', page: 1 })).toBe('/projects');
  });
});
