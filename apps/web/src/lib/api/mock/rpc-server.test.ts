import { describe, expect, it } from 'vitest';
import { handleMockRpc } from './rpc-server';
import { sessionIdFrom } from './store';

const ORIGIN = 'http://localhost:3100';

function rpc(body: unknown, { origin = ORIGIN, session = 'test-session-0001', viewer = 'member' } = {}) {
  return handleMockRpc(
    new Request(`${ORIGIN}/api/mock/rpc`, {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        cookie: `bl_mock_session=${session}; bl_mock_viewer=${viewer}`,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

async function result(response: Response): Promise<unknown> {
  return ((await response.json()) as { result: unknown }).result;
}

describe('mock RPC transport (mock builds only)', () => {
  it('refuses cross-origin requests', async () => {
    const response = await rpc(
      { service: 'member', method: 'listSubmissions', args: [] },
      { origin: 'https://evil.example' },
    );
    expect(response.status).toBe(403);
  });

  it('accepts only allowlisted methods in the exact request shape', async () => {
    for (const body of [
      'not json',
      { service: 'member', method: 'constructor', args: [] },
      { service: 'member', method: '__proto__', args: [] },
      { service: 'store', method: 'reset', args: [] },
      { service: 'member', method: 'listSubmissions', args: [], extra: true },
      { service: 'member', method: 'listSubmissions', args: [1, 2, 3, 4, 5] },
      { service: 'member', method: 'listSubmissions', args: 'none' },
    ]) {
      expect((await rpc(body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it('serves the shared store per demo session, and a reset restores the fixtures', async () => {
    const withdraw = { service: 'member', method: 'withdraw', args: ['RPT-1003', 3] };
    const detail = (await result(
      await rpc(
        { service: 'member', method: 'getSubmission', args: ['RPT-1003'] },
        { session: 'session-aaaa-0001' },
      ),
    )) as { data: { version: number } };
    withdraw.args[1] = detail.data.version;
    const done = (await result(await rpc(withdraw, { session: 'session-aaaa-0001' }))) as {
      data: { status: string };
    };
    expect(done.data.status).toBe('Withdrawn');

    const other = (await result(
      await rpc(
        { service: 'member', method: 'getSubmission', args: ['RPT-1003'] },
        { session: 'session-bbbb-0002' },
      ),
    )) as { data: { status: string } };
    expect(other.data.status).toBe('Information requested');

    expect(
      (await rpc({ service: 'session', method: 'reset', args: [] }, { session: 'session-aaaa-0001' })).status,
    ).toBe(200);
    const restored = (await result(
      await rpc(
        { service: 'member', method: 'getSubmission', args: ['RPT-1003'] },
        { session: 'session-aaaa-0001' },
      ),
    )) as { data: { status: string } };
    expect(restored.data.status).toBe('Information requested');
  });

  it('applies the service rules: a member gets no staff data', async () => {
    const response = await rpc({ service: 'moderation', method: 'getQueue', args: [{}] });
    expect(response.status).toBe(200);
    expect(await result(response)).toMatchObject({ kind: 'error', code: 'forbidden' });
  });

  it('falls back to a shared default session for malformed session cookies', () => {
    expect(sessionIdFrom('bl_mock_session=../../etc')).toBe('default');
    expect(sessionIdFrom('bl_mock_session=abcd1234-ok')).toBe('abcd1234-ok');
  });
});
