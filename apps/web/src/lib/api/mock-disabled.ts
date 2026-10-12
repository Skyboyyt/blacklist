/**
 * Stand-in for `blacklist-mock-api` in non-mock builds (see next.config.ts).
 * Every export fails loudly; none is reachable because each import site is also
 * guarded by `process.env.NEXT_PUBLIC_API_MODE === 'mock'`.
 */
import type * as Mock from './mock/index';

function unavailable(): never {
  throw new Error('The mock API is not included in this build.');
}

export const DemoBanner: typeof Mock.DemoBanner = unavailable;
export const DEMO_EXAMPLES: typeof Mock.DEMO_EXAMPLES = [] as unknown as typeof Mock.DEMO_EXAMPLES;
export const createMockResearchApi: typeof Mock.createMockResearchApi = unavailable;
export const mockAuthApi: typeof Mock.mockAuthApi = new Proxy({} as typeof Mock.mockAuthApi, {
  get: unavailable,
});
export const mockAccountApi: typeof Mock.mockAccountApi = new Proxy({} as typeof Mock.mockAccountApi, {
  get: unavailable,
});
export const mockStaffSecurityApi: typeof Mock.mockStaffSecurityApi = new Proxy(
  {} as typeof Mock.mockStaffSecurityApi,
  {
    get: unavailable,
  },
);
export const mockHumanVerifier: typeof Mock.mockHumanVerifier = new Proxy(
  {} as typeof Mock.mockHumanVerifier,
  {
    get: unavailable,
  },
);
export const mockModerationApi: typeof Mock.mockModerationApi = new Proxy(
  {} as typeof Mock.mockModerationApi,
  {
    get: unavailable,
  },
);
