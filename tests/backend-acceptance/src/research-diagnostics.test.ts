import { Writable } from 'node:stream';
import Fastify from 'fastify';
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { DomainError } from '@blacklist/domain';
import { installResearchDiagnostics } from '../../../apps/api/src/plugins/research-diagnostics.ts';

// Research request logging is off for privacy; failures log only the route pattern, the
// chain slug and the failure class.
describe('research failure diagnostics', () => {
  it('logs failure classes without identifiers, queries or provider detail', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const app = Fastify({ logger: { level: 'info', stream }, disableRequestLogging: true });
    installResearchDiagnostics(app);
    app.get('/api/internal/v1/addresses/:chain/:identifier', async (req) => {
      const { identifier } = req.params as { identifier: string };
      if (identifier === 'validation') z.object({ facts: z.array(z.string()) }).parse({ facts: [1] });
      if (identifier === 'domain') throw new DomainError('rate_limited');
      if (identifier === 'sql') throw Object.assign(new Error('secret value 0xabc'), { code: '42501' });
      return { kind: 'provider_unavailable', retryAfterSeconds: 30, reason: 'timeout' };
    });
    app.get('/api/internal/v1/search', async () => ({ kind: 'not_found' }));
    app.get('/other', async () => ({ kind: 'provider_unavailable' }));
    for (const id of ['validation', 'domain', 'sql', '0xdeadbeef'])
      await app.inject({ method: 'GET', url: `/api/internal/v1/addresses/ethereum/${id}?q=private` });
    await app.inject({ method: 'GET', url: '/api/internal/v1/search?query=0xprivate' });
    await app.inject({ method: 'GET', url: '/other' });
    await app.close();
    const events = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    const research = events.filter((e) =>
      ['research_failed', 'research_unavailable'].includes(String(e['msg'])),
    );
    expect(research.map((e) => [e['msg'], e['failure'] ?? e['reason']])).toEqual([
      ['research_failed', { type: 'validation', paths: ['facts.0'] }],
      ['research_failed', { type: 'domain', code: 'rate_limited' }],
      ['research_failed', { type: 'Error', sqlState: '42501' }],
      ['research_unavailable', 'timeout'],
    ]);
    for (const e of research)
      expect(e).toMatchObject({ route: '/api/internal/v1/addresses/:chain/:identifier', chain: 'ethereum' });
    expect(lines.join('\n')).not.toMatch(/0xdeadbeef|0xprivate|private|secret|0xabc/u);
  });
});
