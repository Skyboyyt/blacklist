import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

afterEach(() => {
  vi.unstubAllEnvs();
});

const request = () =>
  new Request('http://localhost:3100/api/mock/rpc', {
    method: 'POST',
    headers: { origin: 'http://localhost:3100', 'content-type': 'application/json' },
    body: JSON.stringify({ service: 'member', method: 'listSubmissions', args: [] }),
  });

describe('mock RPC route', () => {
  it('does not exist outside mock builds', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'live');
    expect((await POST(request())).status).toBe(404);
  });

  it('serves the demo store in mock builds', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'mock');
    expect((await POST(request())).status).toBe(200);
  });
});
