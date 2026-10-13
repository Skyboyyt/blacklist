import 'server-only';
import { cookies } from 'next/headers';
import { viewerSchema, type Viewer } from '@blacklist/contracts';
import { stagingAccessHeaders } from '../../security/staging-gateway';
export async function getLiveViewer(): Promise<Viewer> {
  const base = process.env['API_INTERNAL_URL'],
    token = process.env['INTERNAL_API_TOKEN'];
  if (!base || !token) return { kind: 'anonymous' };
  try {
    const url = new URL('/api/internal/v1/viewer', base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      return { kind: 'anonymous' };
    const jar = await cookies();
    const cookie = jar.get('__Host-bl_session')?.value;
    if (cookie && (!/^[A-Za-z0-9._%+\-/=]+$/u.test(cookie) || cookie.length > 2048))
      return { kind: 'anonymous' };
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
      headers: {
        ...stagingAccessHeaders(),
        'x-bl-internal-token': token,
        ...(cookie ? { cookie: `__Host-bl_session=${cookie}` } : {}),
      },
    });
    if (!response.ok) return { kind: 'anonymous' };
    return viewerSchema.parse(await response.json());
  } catch {
    return { kind: 'anonymous' };
  }
}
