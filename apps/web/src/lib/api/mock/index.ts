/**
 * Mock entry point, imported only as `blacklist-mock-api`.
 *
 * next.config.ts resolves that alias to this file in mock builds and to
 * ../mock-disabled.ts in every other build, so no mock code or fixture can reach
 * a production bundle (server or browser).
 */
export { DemoBanner } from '@/components/layout/demo-banner';
export { DEMO_EXAMPLES } from './fixtures/examples';
export { mockAccountApi, mockStaffSecurityApi } from './account-api';
export { mockAuthApi, mockHumanVerifier } from './auth-api';
export { mockModerationApi } from './moderation-api';
export { createMockResearchApi } from './research-api';
