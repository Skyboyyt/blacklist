import { randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { readApiConfig } from '@blacklist/config';
import { schema } from '@blacklist/db';
import {
  signIn,
  resolveSession,
  submitSuggestion,
  submitCorrection,
  getOwnSubmission,
  listOwnSubmissions,
  respondToInfoRequest,
  getCase,
  assignCase,
  decideCase,
  caseQueue,
  projectDetail,
  listProjects,
  projectScoreboard,
  projectProfileState,
  type UserActor,
} from '@blacklist/domain';
import { createServer } from '../../../apps/api/src/server.ts';
import {
  startApplicationFixture,
  syntheticPassword,
  fixtureUrl,
  type ApplicationFixture,
} from './application-fixture.ts';
import { addAssuredStaff } from './application-staff-fixture.ts';

// Phase 10 slice 3: project suggestions (ADR 0010 Part A), profile corrections and public
// project profiles. Nothing is public until staff accept; acceptance needs project:manage.

type Staff = Awaited<ReturnType<typeof addAssuredStaff>>;
const prefix = 'ip4:192.0.2.94';
const token = '0x' + 'c3'.repeat(20);
const text = (s: string) => `${s} — fictional text long enough for validation.`;
const directory = { findings: 'any', sort: 'name', page: 1 } as const;

async function member(f: ApplicationFixture) {
  const user = await f.addUser();
  const login = await signIn(f.ctx, user.email, syntheticPassword);
  const cookie = login.cookies.map((c) => c.split(';')[0]).join('; ');
  const actor = await resolveSession(f.ctx.runtime, f.ctx.auth, new Headers({ cookie }));
  if (!actor) throw new Error('fixture_member_session_missing');
  return { actor: actor as UserActor, cookie };
}

async function decide(
  f: ApplicationFixture,
  who: Staff,
  id: string,
  decision: { action: string } & Record<string, unknown>,
  stepUp: boolean,
) {
  const current = await getCase(f.ctx, who.actor, id);
  const assigned =
    current.assignedTo?.id === who.actor.actorRef || decision.action === 'start_review'
      ? current
      : await assignCase(f.ctx, who.actor, id, current.version, { to: 'me', takeOver: true });
  const version = assigned.version;
  return decideCase(
    f.ctx,
    who.actor,
    id,
    version,
    decision,
    stepUp
      ? await who.proof({
          action: `case.${decision.action}`,
          targetType: 'case',
          targetId: id,
          parameters: { version, decision },
        })
      : undefined,
  );
}

describe('Phase 10 slice 3: projects', () => {
  it('turns a reviewed suggestion into a staff profile, revises it by correction and refuses stale corrections', async () => {
    const f = await startApplicationFixture();
    try {
      const suggester = await member(f),
        other = await member(f);
      const moderator = await addAssuredStaff(f, 'moderator'),
        admin = await addAssuredStaff(f, 'admin');
      const { id: suggestionCase } = await submitSuggestion(
        f.ctx,
        suggester.actor,
        {
          name: 'Fictional Swap',
          category: 'defi',
          chain: 'ethereum',
          identifier: token.toUpperCase().replace('0X', '0x'),
          links: ['https://fictional-swap.example/docs', 'https://app.fictional-swap.example'],
          description: text('A fictional exchange'),
          relationship: text('I maintain the docs'),
          evidence: [],
        },
        prefix,
      );
      // Private and with no public effect until accepted.
      expect(await listProjects(f.ctx.runtime.db, directory, { publicBands: false })).toEqual({
        kind: 'empty_directory',
      });
      await expect(getOwnSubmission(f.ctx, other.actor, suggestionCase)).rejects.toThrow('not_found');
      expect((await listOwnSubmissions(f.ctx, suggester.actor)).map((s) => [s.kind, s.status])).toEqual([
        ['project_suggestion', 'Submitted'],
      ]);

      // Staff ask for information; the member answers; it returns to staff.
      await decide(
        f,
        moderator,
        suggestionCase,
        { action: 'request_info', messageToSubmitter: text('Link the deployment') },
        false,
      );
      const asked = await getOwnSubmission(f.ctx, suggester.actor, suggestionCase);
      expect(asked).toMatchObject({ status: 'Information requested', canRespond: true, needsAction: true });
      await respondToInfoRequest(f.ctx, suggester.actor, suggestionCase, asked.version, {
        message: text('Deployment announced on the blog'),
        evidence: [],
      });
      const detail = await getCase(f.ctx, moderator.actor, suggestionCase);
      expect(detail).toMatchObject({
        type: 'project_suggestion',
        status: 'submitted',
        proposal: {
          name: 'Fictional Swap',
          identifier: token,
          links: ['hxxps://fictional-swap[.]example/docs', 'hxxps://app[.]fictional-swap[.]example'],
        },
        resultingSlug: null,
      });
      expect(JSON.stringify(detail)).not.toContain(suggester.actor.userId);

      // Creating a profile needs project:manage (administrators).
      await expect(
        decide(
          f,
          moderator,
          suggestionCase,
          { action: 'accept_suggestion', publicSummary: text('Profile'), internalRationale: text('Checked') },
          true,
        ),
      ).rejects.toThrow('forbidden');
      const accepted = await decide(
        f,
        admin,
        suggestionCase,
        {
          action: 'accept_suggestion',
          publicSummary: text('Profile created'),
          internalRationale: text('Deployment checked'),
        },
        true,
      );
      expect(accepted).toMatchObject({ status: 'accepted_into_profile', resultingSlug: 'fictional-swap' });
      const profile = await projectDetail(f.ctx.runtime.db, 'fictional-swap', { publicBands: false });
      expect(profile).toMatchObject({
        name: 'Fictional Swap',
        category: 'defi',
        profileRevision: 1,
        officialAddresses: [
          {
            chain: 'ethereum',
            address: token,
            basis: 'staff_documentary_review',
            assessment: { band: 'not_assessed' },
          },
        ],
        domains: [{ hostname: 'fictional-swap.example' }, { hostname: 'app.fictional-swap.example' }],
        history: [{ kind: 'profile_created' }],
      });
      expect((await getOwnSubmission(f.ctx, suggester.actor, suggestionCase)).publicLink).toBe(
        '/project/fictional-swap',
      );

      // Directory search, network rules and transaction hashes.
      expect(
        await listProjects(f.ctx.runtime.db, { ...directory, query: 'swap' }, { publicBands: false }),
      ).toMatchObject({
        kind: 'results',
        items: [{ slug: 'fictional-swap', officialAddressCount: 1, publishedFindingCount: 0 }],
      });
      expect(
        await listProjects(f.ctx.runtime.db, { ...directory, query: token }, { publicBands: false }),
      ).toEqual({ kind: 'choose_network' });
      expect(
        await listProjects(
          f.ctx.runtime.db,
          { ...directory, query: token, chain: 'ethereum' },
          { publicBands: false },
        ),
      ).toMatchObject({ kind: 'results' });
      expect(
        await listProjects(
          f.ctx.runtime.db,
          { ...directory, query: '0x' + 'ab'.repeat(32) },
          { publicBands: false },
        ),
      ).toMatchObject({ kind: 'invalid_query' });
      expect(
        await listProjects(
          f.ctx.runtime.db,
          { ...directory, query: 'nothing-like-this' },
          { publicBands: false },
        ),
      ).toEqual({
        kind: 'no_results',
      });

      // Two corrections against revision 1; the second becomes stale once the first is accepted.
      const first = await submitCorrection(
        f.ctx,
        other.actor,
        {
          projectSlug: 'fictional-swap',
          statement: text('Description outdated'),
          description: text('A fictional exchange, v2'),
          addDomain: 'status.fictional-swap.example',
          evidence: [],
        },
        prefix,
      );
      const second = await submitCorrection(
        f.ctx,
        other.actor,
        {
          projectSlug: 'fictional-swap',
          statement: text('Retire app domain'),
          retireDomain: 'app.fictional-swap.example',
          evidence: [],
        },
        prefix,
      );
      const queue = await caseQueue(f.ctx, moderator.actor, { assignment: 'any', sort: 'newest', page: 1 });
      expect(queue.items.find((i) => i.id === first.id)).toMatchObject({
        type: 'correction_request',
        chain: null,
        subject: { kind: 'project', slug: 'fictional-swap' },
      });
      await decide(f, moderator, first.id, { action: 'start_review' }, false);
      await expect(
        decide(
          f,
          moderator,
          first.id,
          { action: 'accept_correction', publicSummary: text('Revised'), internalRationale: text('Checked') },
          true,
        ),
      ).rejects.toThrow('forbidden');
      expect(await getCase(f.ctx, admin.actor, first.id)).toMatchObject({
        type: 'correction_request',
        currentRevision: 1,
        changes: [
          { field: 'description' },
          { field: 'domain_added', proposed: 'status.fictional-swap.example' },
        ],
      });
      await decide(
        f,
        admin,
        first.id,
        { action: 'accept_correction', publicSummary: text('Revised'), internalRationale: text('Checked') },
        true,
      );
      const revised = await projectDetail(f.ctx.runtime.db, 'fictional-swap', { publicBands: false });
      expect(revised).toMatchObject({ profileRevision: 2, description: text('A fictional exchange, v2') });
      expect(revised?.domains.map((d) => d.hostname)).toContain('status.fictional-swap.example');
      // The correction reviewer's view of the profile (staff only).
      expect(await projectProfileState(f.ctx.runtime.db, moderator.actor, 'fictional-swap')).toMatchObject({
        slug: 'fictional-swap',
        revision: 2,
        domains: expect.arrayContaining(['status.fictional-swap.example']),
      });
      await expect(projectProfileState(f.ctx.runtime.db, suggester.actor, 'fictional-swap')).rejects.toThrow(
        'forbidden',
      );
      await expect(projectProfileState(f.ctx.runtime.db, moderator.actor, 'nope')).rejects.toThrow(
        'not_found',
      );
      // ADR 0012: with public bands off nothing is ranked, and the reason is given.
      expect(await projectScoreboard(f.ctx.runtime.db, {}, { publicBands: false })).toEqual({
        asOf: null,
        ranked: [],
        notRanked: [{ slug: 'fictional-swap', name: 'Fictional Swap', reason: 'not_assessed' }],
      });
      expect(await projectScoreboard(f.ctx.runtime.db, { chain: 'solana' }, { publicBands: false })).toEqual({
        asOf: null,
        ranked: [],
        notRanked: [],
      });
      expect(revised?.history.map((h) => h.kind)).toEqual([
        'profile_created',
        'profile_revised',
        'domain_added',
      ]);
      await decide(f, admin, second.id, { action: 'start_review' }, false);
      await expect(
        decide(
          f,
          admin,
          second.id,
          { action: 'accept_correction', publicSummary: text('Revised'), internalRationale: text('Checked') },
          true,
        ),
      ).rejects.toThrow('conflict');
      const rejected = await decide(
        f,
        admin,
        second.id,
        { action: 'reject_correction', reason: 'already_corrected', internalRationale: text('Stale') },
        true,
      );
      expect(rejected.status).toBe('rejected');
      // Retiring a domain that is not an active official domain is refused; nothing changes.
      const third = await submitCorrection(
        f.ctx,
        other.actor,
        {
          projectSlug: 'fictional-swap',
          statement: text('Retire an unknown domain'),
          retireDomain: 'unknown.fictional-swap.example',
          evidence: [],
        },
        prefix,
      );
      await decide(f, admin, third.id, { action: 'start_review' }, false);
      await expect(
        decide(
          f,
          admin,
          third.id,
          { action: 'accept_correction', publicSummary: text('Revised'), internalRationale: text('Checked') },
          true,
        ),
      ).rejects.toThrow('invalid_transition');
      expect(
        (await projectDetail(f.ctx.runtime.db, 'fictional-swap', { publicBands: false }))?.profileRevision,
      ).toBe(2);
      expect(await getOwnSubmission(f.ctx, other.actor, second.id)).toMatchObject({
        status: 'Not accepted',
        submitterReason: 'already_corrected',
      });

      // Profile history is append-only.
      await expect(f.ctx.runtime.db.update(schema.projectRevisions).set({ name: 'x' })).rejects.toThrow();
    } finally {
      await f.stop();
    }
  });

  it('serves profiles publicly and keeps suggestions and corrections member-only', async () => {
    const f = await startApplicationFixture();
    const app = createServer(
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
    );
    try {
      const m = await member(f);
      const staff = await addAssuredStaff(f, 'moderator');
      const post = (url: string, body: unknown, cookie?: string) =>
        app.inject({
          method: 'POST',
          url,
          headers: {
            origin: f.ctx.settings.origin,
            'content-type': 'application/json',
            ...(cookie ? { cookie } : {}),
          },
          payload: JSON.stringify(body),
        });
      expect((await app.inject({ method: 'GET', url: '/api/v1/projects' })).json()).toEqual({
        kind: 'empty_directory',
      });
      expect((await app.inject({ method: 'GET', url: '/api/v1/projects/scoreboard' })).json()).toEqual({
        asOf: null,
        ranked: [],
        notRanked: [],
      });
      expect(
        (await app.inject({ method: 'GET', url: '/api/v1/projects/scoreboard?chain=bitcoin' })).statusCode,
      ).toBe(400);
      const state = (cookie?: string) =>
        app.inject({
          method: 'GET',
          url: '/api/v1/mod/projects/no-such-project/state',
          headers: cookie ? { cookie } : {},
        });
      expect((await state()).statusCode).toBe(401);
      expect((await state(m.cookie)).statusCode).toBe(403);
      expect((await state(staff.headers.get('cookie') ?? '')).statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url: '/api/v1/projects/no-such-project' })).json()).toEqual({
        kind: 'not_found',
      });
      expect((await app.inject({ method: 'GET', url: '/api/v1/projects/Not_A_Slug' })).json()).toEqual({
        kind: 'not_found',
      });
      const suggestion = {
        name: 'Fictional Bridge',
        category: 'infrastructure',
        chain: 'ethereum',
        identifier: '0x' + 'd4'.repeat(20),
        links: ['https://fictional-bridge.example'],
        description: text('A fictional bridge'),
        relationship: text('I am a contributor'),
        evidence: [],
      };
      expect((await post('/api/v1/projects/suggestions', suggestion)).statusCode).toBe(401);
      expect(
        (await post('/api/v1/projects/suggestions', suggestion, staff.headers.get('cookie') ?? ''))
          .statusCode,
      ).toBe(403);
      expect(
        (await post('/api/v1/projects/suggestions', { ...suggestion, status: 'accepted' }, m.cookie))
          .statusCode,
      ).toBe(400);
      expect((await post('/api/v1/projects/suggestions', suggestion, m.cookie)).statusCode).toBe(200);
      const correction = {
        projectSlug: 'fictional-bridge',
        statement: text('Fix'),
        description: text('Better text'),
        evidence: [],
      };
      expect(
        (await post('/api/v1/projects/other-project/corrections', correction, m.cookie)).statusCode,
      ).toBe(404);
      expect(
        (await post('/api/v1/projects/fictional-bridge/corrections', correction, m.cookie)).statusCode,
      ).toBe(404);
    } finally {
      await app.close();
      await f.stop();
    }
  });
});
