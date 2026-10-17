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
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure('temporarily_unavailable');
  }
}
