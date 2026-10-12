import {
  addressResearchSchema,
  projectDirectoryRequestSchema,
  type ProjectDetail,
  type ProjectDirectoryResponse,
  type Viewer,
} from '@blacklist/contracts';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../../../test/a11y';
import { ADDRESS_FIXTURES } from '@/lib/api/mock/fixtures/addresses';
import { PROJECT_ADDRESS_FIXTURES, PROJECT_FIXTURES } from '@/lib/api/mock/fixtures/projects';
import { createProjectCatalog } from '@/lib/api/mock/project-api';
import { ProjectCard } from './project-card';
import { ProjectDetailView } from './project-detail-view';
import { ProjectDirectoryResults } from './project-directory-results';
import { ProjectFilters } from './project-filters';

const catalog = createProjectCatalog({
  addresses: addressResearchSchema.array().parse([...ADDRESS_FIXTURES, ...PROJECT_ADDRESS_FIXTURES]),
  projects: PROJECT_FIXTURES,
});
const project = (slug: string): ProjectDetail => {
  const found = catalog.details.find((d) => d.slug === slug);
  if (!found) throw new Error(`missing fixture ${slug}`);
  return found;
};
const defaults = projectDirectoryRequestSchema.parse({});
const anonymous: Viewer = { kind: 'anonymous' };
const member: Viewer = { kind: 'signed_in', handle: 'demo_member', role: 'member', emailVerified: true };

/** No public number that could be read as a score (P-11). */
function expectNoScore(container: HTMLElement) {
  expect(container.textContent).not.toMatch(/score|\/\s?100|\b\d{1,3}\s?%/i);
}

describe('project directory', () => {
  it('cards show the network, a full official identifier and findings, never a band or score', () => {
    const res = catalog.list({ ...defaults, query: 'yield' });
    if (res.kind !== 'results') throw new Error('expected results');
    const { container } = render(<ProjectCard project={res.items[0]!} />);
    expect(screen.getByRole('link', { name: 'Demo Yield Vault' })).toHaveAttribute(
      'href',
      '/project/demo-yield-vault',
    );
    expect(screen.getByText('Ethereum')).toBeInTheDocument();
    expect(screen.getByText('1 published finding')).toBeInTheDocument();
    expect(screen.getByTitle(res.items[0]!.primaryIdentifier!.displayAddress)).toBeInTheDocument();
    expect(container.querySelector('[data-band]')).toBeNull();
    expectNoScore(container);
  });

  it('marks partial and stale profiles and profiles without official addresses', () => {
    const res = catalog.list({ ...defaults, query: 'new listing' });
    if (res.kind !== 'results') throw new Error('expected results');
    render(<ProjectCard project={res.items[0]!} />);
    expect(screen.getByText('No official addresses listed yet.')).toBeInTheDocument();
    expect(screen.getByText('Partial data')).toBeInTheDocument();
  });

  it('paginates with links that keep the selected network and filters', () => {
    const query = { ...defaults, chain: 'ethereum' as const, findings: 'any' as const };
    const response = catalog.list(query);
    render(<ProjectDirectoryResults query={query} response={response} />);
    const nav = screen.getByRole('navigation', { name: 'Pagination' });
    expect(within(nav).getByRole('link', { name: /Next page/ })).toHaveAttribute(
      'href',
      '/projects?chain=ethereum&page=2',
    );
    expect(within(nav).getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Showing 1–6 of/ })).toBeInTheDocument();
  });

  it.each([
    [{ kind: 'no_results' }, 'No projects match', /does not mean a project is safe or unsafe/],
    [{ kind: 'empty_directory' }, 'No project profiles yet', /not published any/],
    [{ kind: 'choose_network' }, 'Choose a network for this address', /never matched across networks/],
    [{ kind: 'invalid_query', reason: 'Bad input.' }, 'That search can’t be used here', /Bad input/],
    [
      { kind: 'provider_unavailable', retryAfterSeconds: 30 },
      'Project data is temporarily unavailable',
      /30 seconds/,
    ],
  ] as const)('renders the %o state', (response, title, body) => {
    render(<ProjectDirectoryResults query={defaults} response={response as ProjectDirectoryResponse} />);
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText(body)).toBeInTheDocument();
  });

  it('filters are a labelled GET search form that reflects the URL', async () => {
    const { container } = render(
      <ProjectFilters query={{ ...defaults, query: 'demo', chain: 'solana', findings: 'disputed' }} />,
    );
    const form = screen.getByRole('search', { name: 'Search and filter projects' });
    expect(form).toHaveAttribute('method', 'get');
    expect(screen.getByLabelText('Search projects')).toHaveValue('demo');
    expect(screen.getByLabelText('Network')).toHaveValue('solana');
    expect(screen.getByLabelText('Findings status')).toHaveValue('disputed');
    const networks = within(screen.getByLabelText('Network'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(networks).toEqual(['All supported networks', 'Ethereum', 'Solana']);
    await expectNoAxeViolations(container);
  });
});

describe('project detail', () => {
  it('states the limits of a profile and never shows a combined rating or score', () => {
    const { container } = render(
      <ProjectDetailView project={project('demo-rewards-hub')} viewer={anonymous} />,
    );
    expect(screen.getByText(/do not guarantee safety or investment returns/)).toBeInTheDocument();
    expect(screen.getByText(/does not give projects a combined risk rating/)).toBeInTheDocument();
    expect(screen.getByText(/not proof of ownership or control/)).toBeInTheDocument();
    expect(container.querySelectorAll('[data-band]')).toHaveLength(1);
    expectNoScore(container);
  });

  it('distinguishes not assessed from unavailable, and neither is shown as low', () => {
    const quiet = render(<ProjectDetailView project={project('demo-quiet-token')} viewer={anonymous} />);
    expect(screen.getByText('Not assessed')).toBeInTheDocument();
    expect(screen.getByText(/This is not an indication of safety/)).toBeInTheDocument();
    quiet.unmount();
    const { container } = render(
      <ProjectDetailView project={project('demo-oracle-network')} viewer={anonymous} />,
    );
    expect(screen.getByText('Assessment unavailable right now')).toBeInTheDocument();
    expect(container.querySelector('[data-band]')).toBeNull();
  });

  it('keeps capability disclosures apart from risk factors', () => {
    render(<ProjectDetailView project={project('demoswap')} viewer={anonymous} />);
    const disclosures = screen.getByRole('region', { name: /Disclosures for this contract address/ });
    const assessment = screen.getByRole('region', { name: /Assessment of this contract address/ });
    expect(within(disclosures).getAllByText('Disclosure').length).toBeGreaterThan(0);
    expect(within(assessment).queryByText('Disclosure')).toBeNull();
    expect(
      within(assessment).getByText('No risk factors were found in the available data.'),
    ).toBeInTheDocument();
  });

  it('shows findings with dispute state, responses with standing, and history', () => {
    render(<ProjectDetailView project={project('demo-rewards-hub')} viewer={member} />);
    expect(screen.getAllByText('Disputed — under appeal').length).toBeGreaterThan(0);
    expect(screen.getByText(/Standing: Staff-reviewed documents/)).toBeInTheDocument();
    expect(screen.getByText('Appeal filed by the project (documentary standing)')).toBeInTheDocument();
  });

  it('links official addresses to their own research pages', () => {
    render(<ProjectDetailView project={project('demo-wallet-app')} viewer={anonymous} />);
    const links = screen
      .getAllByRole('link', { name: 'Open full address research' })
      .map((l) => l.getAttribute('href'));
    expect(links).toHaveLength(2);
    expect(links[0]).toMatch(/^\/address\/ethereum\/0xb1ac/);
    expect(links[1]).toMatch(/^\/address\/solana\/Demo/);
  });

  it('shows stale data clearly', () => {
    render(<ProjectDetailView project={project('demo-dormant-protocol')} viewer={anonymous} />);
    expect(screen.getAllByText('May be out of date').length).toBeGreaterThan(0);
    expect(screen.getByText(/have not re-reviewed this profile since March 2026/)).toBeInTheDocument();
  });

  it('sends signed-out viewers to sign in and back; signed-in viewers to the redress flows', () => {
    const out = render(<ProjectDetailView project={project('demoswap')} viewer={anonymous} />);
    expect(screen.getByRole('link', { name: 'Sign in to respond, correct or appeal' })).toHaveAttribute(
      'href',
      '/login?next=%2Fproject%2Fdemoswap',
    );
    expect(screen.queryByRole('link', { name: 'Propose a correction' })).toBeNull();
    out.unmount();
    render(<ProjectDetailView project={project('demoswap')} viewer={member} />);
    expect(screen.getByRole('link', { name: 'Propose a correction' })).toHaveAttribute(
      'href',
      '/corrections/new?project=demoswap',
    );
    expect(screen.getByRole('link', { name: 'Report a concern' })).toHaveAttribute('href', '/reports/new');
  });

  it('has no detectable accessibility violations', async () => {
    const { container } = render(<ProjectDetailView project={project('demo-rewards-hub')} viewer={member} />);
    await expectNoAxeViolations(container);
  });
});
