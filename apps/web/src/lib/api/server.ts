import 'server-only';

import { cookies } from 'next/headers';
import type { ResearchApi } from './types';
import { liveResearchApi } from './live/research';

/** Mock-only preview cookies (viewer and scenario). They confer no authority. */
const MOCK_VIEWER_COOKIE = 'bl_mock_viewer';
const MOCK_SCENARIO_COOKIE = 'bl_mock_scenario';
const MOCK_SESSION_COOKIE = 'bl_mock_session';

/** Research API for server components. */
export async function getResearchApi(): Promise<ResearchApi> {
  if (process.env.NEXT_PUBLIC_API_MODE === 'mock') {
    const { createMockResearchApi } = await import('blacklist-mock-api');
    const jar = await cookies();
    return createMockResearchApi({
      viewer: jar.get(MOCK_VIEWER_COOKIE)?.value,
      scenario: jar.get(MOCK_SCENARIO_COOKIE)?.value,
      // The shared demo store for this browser's demo session (set by the proxy in mock builds).
      sessionId: jar.get(MOCK_SESSION_COOKIE)?.value,
    });
  }
  return liveResearchApi;
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
