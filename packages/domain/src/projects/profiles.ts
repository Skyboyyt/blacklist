import { schema, eq, and, asc, desc, isNull, inArray, type Database } from '@blacklist/db';
import { appendAudit } from '../audit/service.ts';
import type { Actor } from '../access/types.ts';
import { addressOf, addressSubject, type ChainSlug } from '../moderation/subjects.ts';
import { publicFindings } from '../moderation/findings.ts';
import { publicRedress } from '../moderation/redress.ts';
import { publicAssessment } from '../risk/views.ts';

// Staff project profiles (data-model §4; ADR 0010 Part A; PRD §5.17). A profile is created
// and revised only by staff decisions; each change is an append-only revision. Listing an
// address or domain records a basis, never ownership. Public views carry no combined
// project rating: each official address shows its own assessment.

export type ProjectCategory =
  'defi' | 'exchange' | 'wallet' | 'token' | 'nft' | 'infrastructure' | 'dao' | 'other';
const DISPUTE_RANK = { none: 0, under_appeal: 1, suspended_pending_review: 2 } as const;
type Dispute = keyof typeof DISPUTE_RANK;
const PAGE_SIZE = 6;

export function slugify(name: string) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'project';
  return base.length >= 2 ? base : `${base}-project`;
}

async function freeSlug(tx: Database, name: string) {
  const base = slugify(name);
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const [taken] = await tx
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.slug, slug));
    if (!taken) return slug;
  }
}

/** Creates a profile (revision 1) from an accepted suggestion. Returns the project. */
export async function createProject(
  tx: Database,
  actor: Actor,
  input: {
    name: string;
    category: ProjectCategory;
    description: string;
    address: { chain: ChainSlug; address: string };
    domains: readonly string[];
    sourceCaseId: string;
  },
) {
  const [subject] = await tx.insert(schema.subjects).values({ kind: 'project' }).returning();
  if (!subject) throw new Error('subject_creation_failed');
  const [project] = await tx
    .insert(schema.projects)
    .values({ subjectId: subject.id, slug: await freeSlug(tx, input.name), currentRevision: 1 })
    .returning();
  if (!project) throw new Error('project_creation_failed');
  await tx.insert(schema.projectRevisions).values({
    projectId: project.id,
    revisionNumber: 1,
    name: input.name,
    category: input.category,
    description: input.description,
    authorRef: actor.actorRef,
    sourceCaseId: input.sourceCaseId,
    publicNote: 'Profile created by staff from a suggestion',
  });
  const { subjectId } = await addressSubject(tx, input.address.chain, input.address.address);
  await tx.insert(schema.projectAddresses).values({
    projectId: project.id,
    addressSubjectId: subjectId,
    role: 'contract',
    basis: 'staff_documentary_review',
    basisNote: 'Suggested by a project representative and reviewed by staff.',
  });
  for (const hostname of new Set(input.domains))
    await tx.insert(schema.projectDomains).values({
      projectId: project.id,
      hostname,
      basis: 'staff_documentary_review',
      basisNote: 'Listed in the suggestion and reviewed by staff.',
    });
  await appendAudit(tx, actor, 'project.created', 'project', project.id);
  return project;
}

/** The latest revision of a project. */
export async function latestRevision(tx: Database, projectId: string) {
  const [revision] = await tx
    .select()
    .from(schema.projectRevisions)
    .where(eq(schema.projectRevisions.projectId, projectId))
    .orderBy(desc(schema.projectRevisions.revisionNumber))
    .limit(1);
  if (!revision) throw new Error('project_without_revision');
  return revision;
}

async function profileRows(db: Database, projectId: string) {
  const addresses = await db
    .select()
    .from(schema.projectAddresses)
    .where(and(eq(schema.projectAddresses.projectId, projectId), isNull(schema.projectAddresses.retiredAt)))
    .orderBy(asc(schema.projectAddresses.attributedAt));
  const allAddresses = await db
    .select()
    .from(schema.projectAddresses)
    .where(eq(schema.projectAddresses.projectId, projectId));
  const domains = await db
    .select()
    .from(schema.projectDomains)
    .where(eq(schema.projectDomains.projectId, projectId))
    .orderBy(asc(schema.projectDomains.attributedAt));
  const revisions = await db
    .select()
    .from(schema.projectRevisions)
    .where(eq(schema.projectRevisions.projectId, projectId))
    .orderBy(asc(schema.projectRevisions.revisionNumber));
  return { addresses, allAddresses, domains, revisions };
}

const worst = (states: readonly Dispute[]) =>
  states.reduce<Dispute>((w, s) => (DISPUTE_RANK[s] > DISPUTE_RANK[w] ? s : w), 'none');

/** Public project page (contracts `projectDetailSchema`). */
export async function projectDetail(db: Database, slug: string, options: { publicBands: boolean }) {
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.slug, slug));
  if (!project) return null;
  const { addresses, allAddresses, domains, revisions } = await profileRows(db, project.id);
  const latest = revisions.at(-1);
  if (!latest) throw new Error('project_without_revision');
  const officialAddresses = [];
  const findings = [];
  const timeline = [];
  const responses = [];
  for (const row of addresses) {
    const a = await addressOf(db, row.addressSubjectId);
    if (!a) continue;
    const [network] = await db.select().from(schema.chains).where(eq(schema.chains.slug, a.chain));
    const published = await publicFindings(db, network?.chainId ?? '', a.address);
    const redress = await publicRedress(
      db,
      row.addressSubjectId,
      published.findings.map((f) => f.id),
    );
    const own = published.findings.map((f) =>
      redress.underAppeal.has(f.id) ? { ...f, disputeState: 'under_appeal' as const } : f,
    );
    findings.push(...own);
    timeline.push(...published.timeline, ...redress.timeline);
    responses.push(...redress.responses);
    officialAddresses.push({
      chain: a.chain,
      address: a.address,
      displayAddress: a.address,
      role: row.role,
      basis: row.basis,
      basisNote: row.basisNote,
      attributedAt: row.attributedAt.toISOString(),
      assessment: await publicAssessment(db, row.addressSubjectId, {
        publicBands: options.publicBands,
        disputeState: worst(own.map((f) => f.disputeState)),
      }),
      disclosures: [],
    });
  }
  const history = [
    ...revisions.map((r) => ({
      id: r.id,
      kind: r.revisionNumber === 1 ? ('profile_created' as const) : ('profile_revised' as const),
      label: r.publicNote,
      at: r.createdAt.toISOString(),
      actor: 'moderator' as const,
    })),
    ...allAddresses
      .filter((r) => r.retiredAt)
      .map((r) => ({
        id: `address-retired-${r.id}`,
        kind: 'official_address_retired' as const,
        label: 'An official address was retired',
        at: (r.retiredAt ?? r.attributedAt).toISOString(),
        actor: 'moderator' as const,
      })),
    ...domains.flatMap((d) => [
      ...(d.attributedAt.getTime() > (revisions[0]?.createdAt.getTime() ?? 0)
        ? [
            {
              id: `domain-added-${d.id}`,
              kind: 'domain_added' as const,
              label: `Official domain added: ${d.hostname}`,
              at: d.attributedAt.toISOString(),
              actor: 'moderator' as const,
            },
          ]
        : []),
      ...(d.retiredAt
        ? [
            {
              id: `domain-retired-${d.id}`,
              kind: 'domain_retired' as const,
              label: `Official domain retired: ${d.hostname}`,
              at: d.retiredAt.toISOString(),
              actor: 'moderator' as const,
            },
          ]
        : []),
    ]),
    ...timeline.filter((t) =>
      [
        'finding_published',
        'finding_superseded',
        'finding_suspended',
        'appeal_filed',
        'appeal_decided',
        'response_published',
      ].includes(t.kind),
    ),
  ].sort((x, y) => x.at.localeCompare(y.at));
  const updatedAt =
    [latest.createdAt.toISOString(), ...history.map((h) => h.at)].sort().at(-1) ??
    latest.createdAt.toISOString();
  return {
    slug: project.slug,
    name: latest.name,
    category: latest.category as ProjectCategory,
    description: latest.description,
    officialAddresses,
    domains: domains
      .filter((d) => !d.retiredAt)
      .map((d) => ({
        hostname: d.hostname,
        basis: d.basis,
        basisNote: d.basisNote,
        attributedAt: d.attributedAt.toISOString(),
      })),
    findings,
    responses,
    history,
    profileRevision: latest.revisionNumber,
    lastReviewedAt: latest.createdAt.toISOString(),
    updatedAt,
    freshness: { state: 'current' as const, note: null },
  };
}

export type ProjectDetailView = NonNullable<Awaited<ReturnType<typeof projectDetail>>>;

export interface DirectoryQuery {
  query?: string | undefined;
  chain?: ChainSlug | undefined;
  category?: ProjectCategory | undefined;
  findings: 'any' | 'with_findings' | 'without_findings' | 'disputed';
  sort: 'name' | 'recently_reviewed' | 'most_findings';
  page: number;
}

const EVM = /^0x[0-9a-fA-F]{40}$/;
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TX = /^0x[0-9a-fA-F]{64}$|^[1-9A-HJ-NP-Za-km-z]{80,90}$/;

/** Project directory (contracts `projectDirectoryResponseSchema`); mirrors the mock catalog rules. */
export async function listProjects(db: Database, q: DirectoryQuery, options: { publicBands: boolean }) {
  const all = await db.select().from(schema.projects).orderBy(asc(schema.projects.slug));
  if (!all.length) return { kind: 'empty_directory' as const };
  const details = [];
  for (const p of all) {
    const d = await projectDetail(db, p.slug, options);
    if (d) details.push(d);
  }
  const text = q.query?.trim() ?? '';
  let matched = details;
  if (text) {
    if (TX.test(text))
      return {
        kind: 'invalid_query' as const,
        reason: 'That is a transaction hash. Look it up in Research instead.',
      };
    if (EVM.test(text) || SOLANA.test(text)) {
      if (!q.chain) return { kind: 'choose_network' as const };
      const valid = q.chain === 'ethereum' ? EVM.test(text) : SOLANA.test(text);
      if (!valid)
        return {
          kind: 'invalid_query' as const,
          reason: `This is not a valid ${q.chain === 'ethereum' ? 'Ethereum' : 'Solana'} address.`,
        };
      const normalized = q.chain === 'ethereum' ? text.toLowerCase() : text;
      matched = details.filter((d) =>
        d.officialAddresses.some((a) => a.chain === q.chain && a.address === normalized),
      );
    } else {
      const needle = text.toLowerCase();
      matched = details.filter(
        (d) =>
          d.name.toLowerCase().includes(needle) || d.domains.some((dom) => dom.hostname.includes(needle)),
      );
    }
  }
  const summaries = matched
    .filter((d) => !q.chain || d.officialAddresses.some((a) => a.chain === q.chain))
    .filter((d) => !q.category || d.category === q.category)
    .map((d) => {
      const first = d.officialAddresses.find((a) => !q.chain || a.chain === q.chain);
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
        disputeState: worst(d.findings.map((f) => f.disputeState)),
        lastReviewedAt: d.lastReviewedAt,
        freshness: d.freshness.state,
      };
    })
    .filter((s) =>
      q.findings === 'any'
        ? true
        : q.findings === 'with_findings'
          ? s.publishedFindingCount > 0
          : q.findings === 'without_findings'
            ? s.publishedFindingCount === 0
            : s.disputeState !== 'none',
    )
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name, 'en');
      if (q.sort === 'recently_reviewed') return b.lastReviewedAt.localeCompare(a.lastReviewedAt) || byName;
      if (q.sort === 'most_findings') return b.publishedFindingCount - a.publishedFindingCount || byName;
      return byName;
    });
  if (!summaries.length) return { kind: 'no_results' as const };
  const totalPages = Math.ceil(summaries.length / PAGE_SIZE);
  const page = Math.min(q.page, totalPages);
  return {
    kind: 'results' as const,
    items: summaries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    page,
    pageSize: PAGE_SIZE,
    totalItems: summaries.length,
    totalPages,
  };
}

/** Projects whose official addresses include any of these subjects (case views, scoreboard). */
export async function projectsForSubjects(db: Database, subjectIds: readonly string[]) {
  if (!subjectIds.length) return [];
  return db
    .select({ projectId: schema.projectAddresses.projectId })
    .from(schema.projectAddresses)
    .where(
      and(
        inArray(schema.projectAddresses.addressSubjectId, [...subjectIds]),
        isNull(schema.projectAddresses.retiredAt),
      ),
    );
}
