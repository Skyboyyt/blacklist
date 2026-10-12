import 'server-only';

import { cookies } from 'next/headers';
import { notConnectedResearchApi } from './not-connected';
import type { ResearchApi } from './types';

/** Mock-only preview cookies (viewer and scenario). They confer no authority. */
const MOCK_VIEWER_COOKIE = 'bl_mock_viewer';
const MOCK_SCENARIO_COOKIE = 'bl_mock_scenario';

/** Research API for server components. */
export async function getResearchApi(): Promise<ResearchApi> {
  if (process.env.NEXT_PUBLIC_API_MODE === 'mock') {
    const { createMockResearchApi } = await import('blacklist-mock-api');
    const jar = await cookies();
    return createMockResearchApi({
      viewer: jar.get(MOCK_VIEWER_COOKIE)?.value,
      scenario: jar.get(MOCK_SCENARIO_COOKIE)?.value,
    });
  }
  return notConnectedResearchApi;
}

export interface DemoExample {
  readonly label: string;
  readonly query: string;
}

/** Example searches for the home page. Mock mode only; empty in every other build. */
export async function getDemoExamples(): Promise<readonly DemoExample[]> {
  if (process.env.NEXT_PUBLIC_API_MODE !== 'mock') return [];
  const { DEMO_EXAMPLES } = await import('blacklist-mock-api');
  return DEMO_EXAMPLES;
}
