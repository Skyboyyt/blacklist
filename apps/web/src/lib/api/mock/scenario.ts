/**
 * Mock-only preview controls, chosen in the demo banner and stored in plain cookies.
 * They change what the mock returns and nothing else: they grant no access and do
 * not exist in production builds.
 */
export const MOCK_COOKIES = {
  viewer: 'bl_mock_viewer',
  scenario: 'bl_mock_scenario',
  passkey: 'bl_mock_passkey',
} as const;

export const MOCK_VIEWERS = ['anonymous', 'member', 'moderator', 'admin'] as const;

/** Account situations that are hard to reach by clicking around. */
export const MOCK_SCENARIOS = ['normal', 'cooling_period', 'session_expired', 'staff_recovery'] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];

/** What the simulated authenticator does when a passkey ceremony starts. */
export const MOCK_PASSKEY_RESULTS = ['verified', 'cancelled', 'timed_out', 'unsupported', 'failed'] as const;
export type MockPasskeyResult = (typeof MOCK_PASSKEY_RESULTS)[number];

export function readCookie(source: string, name: string): string | undefined {
  return source
    .split('; ')
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value ?? '') ? (value as T) : fallback;
}

export function currentScenario(cookieSource: string): MockScenario {
  return pick(readCookie(cookieSource, MOCK_COOKIES.scenario), MOCK_SCENARIOS, 'normal');
}

export function currentPasskeyResult(cookieSource: string): MockPasskeyResult {
  return pick(readCookie(cookieSource, MOCK_COOKIES.passkey), MOCK_PASSKEY_RESULTS, 'verified');
}

export function currentViewerKey(cookieSource: string): (typeof MOCK_VIEWERS)[number] {
  return pick(readCookie(cookieSource, MOCK_COOKIES.viewer), MOCK_VIEWERS, 'member');
}
