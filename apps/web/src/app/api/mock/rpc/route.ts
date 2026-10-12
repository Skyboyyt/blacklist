/**
 * Mock-only RPC route for the demo store (ARCHITECTURE §36 frontend-first). Outside mock
 * builds it answers 404 and its handler is a stub, so it can never serve data in production.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (process.env.NEXT_PUBLIC_API_MODE !== 'mock') return new Response('Not found', { status: 404 });
  const { handleMockRpc } = await import('blacklist-mock-api');
  return handleMockRpc(request);
}
