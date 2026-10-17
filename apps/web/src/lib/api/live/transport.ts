import { httpProblemSchema, httpRefusalSchema as refusalSchema } from '@blacklist/contracts';
import type { z } from 'zod';
export class ApiFailure extends Error {
  readonly code: string;
  readonly requestId: string;
  readonly retryAfterSeconds: number;
  readonly detail: string | undefined;
  readonly currentVersion: number | undefined;
  constructor(
    code: string,
    requestId = 'unavailable',
    retryAfterSeconds = 60,
    refusal: z.infer<typeof refusalSchema> = {},
  ) {
    super(code);
    this.code = code;
    this.requestId = requestId;
    this.retryAfterSeconds = retryAfterSeconds;
    this.detail = refusal.detail;
    this.currentVersion = refusal.currentVersion;
  }
}
async function parse<S extends z.ZodType>(response: Response, schema: S): Promise<z.output<S>> {
  const payload: unknown = await response.json();
  if (!response.ok) {
    const problem = httpProblemSchema.safeParse(payload);
    const refusal = refusalSchema.safeParse(payload);
    const delay = Number(response.headers.get('retry-after'));
    throw new ApiFailure(
      problem.success ? problem.data.code : 'temporarily_unavailable',
      problem.success ? problem.data.requestId : undefined,
      Number.isSafeInteger(delay) && delay > 0 ? delay : 60,
      refusal.success ? refusal.data : {},
    );
  }
  const result = schema.safeParse(payload);
  if (!result.success) throw new ApiFailure('temporarily_unavailable');
  return result.data;
}

export async function request<S extends z.ZodType>(
  path: string,
  schema: S,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
): Promise<z.output<S>> {
  try {
    const response = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      // Free Render can take longer than20seconds to wake for an auth request.
      signal: AbortSignal.timeout(path.startsWith('/auth/') ? 90_000 : 20_000),
    });
    return await parse(response, schema);
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure('temporarily_unavailable');
  }
}

/** One image as the raw request body (the evidence upload route takes no JSON). */
export async function uploadImage<S extends z.ZodType>(
  path: string,
  schema: S,
  file: Blob,
): Promise<z.output<S>> {
  try {
    const response = await fetch(`/api/v1${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      headers: { 'content-type': file.type },
      body: file,
      // A 10 MiB upload to a waking free API can take a while.
      signal: AbortSignal.timeout(120_000),
    });
    // A proxy in front of the API may refuse a large body with a non-JSON page.
    if (response.status === 413) throw new ApiFailure('payload_too_large');
    return await parse(response, schema);
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure('temporarily_unavailable');
  }
}
