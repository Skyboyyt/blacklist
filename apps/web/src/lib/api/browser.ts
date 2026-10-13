import { notConnectedHumanVerifier } from './not-connected';
import type {
  AccountApi,
  AdminApi,
  AuthApi,
  HumanVerifierClient,
  MemberApi,
  ModerationApi,
  StaffSecurityApi,
} from './types';
import { liveAuthApi } from './live/auth';
import { liveAccountApi } from './live/account';
import { liveStaffSecurityApi } from './live/staff';
import { liveAdminApi } from './live/admin';
import { liveMemberApi } from './live/member';
import { liveModerationApi } from './live/moderation';

/** Auth API for client components (browser). */
export async function getAuthApi(): Promise<AuthApi> {
  if (process.env.NEXT_PUBLIC_API_MODE === 'mock') {
    const { mockAuthApi } = await import('blacklist-mock-api');
    return mockAuthApi;
  }
  return liveAuthApi;
}

/** Signed-in account and security API for client components. */
export async function getAccountApi(): Promise<AccountApi> {
  if (process.env.NEXT_PUBLIC_API_MODE === 'mock') {
    const { mockAccountApi } = await import('blacklist-mock-api');
    return mockAccountApi;
  }
  return liveAccountApi;
}

/** Staff security API for client components. */
export async function getStaffSecurityApi(): Promise<StaffSecurityApi> {
  if (process.env.NEXT_PUBLIC_API_MODE === 'mock') {
    const { mockStaffSecurityApi } = await import('blacklist-mock-api');
    return mockStaffSecurityApi;
  }
  return liveStaffSecurityApi;
}

/** Human-verification widget for client components (login escalation, identity §12). */
export async function getHumanVerifier(): Promise<HumanVerifierClient> {
  if (process.env.NEXT_PUBLIC_API_MODE === 'mock') {
    const { mockHumanVerifier } = await import('blacklist-mock-api');
    return mockHumanVerifier;
  }
  return notConnectedHumanVerifier;
}

/** Staff review API for client components (mock in development; not connected otherwise). */
export async function getModerationApi(): Promise<ModerationApi> {
  if (process.env.NEXT_PUBLIC_API_MODE === 'mock') {
    const { mockModerationApi } = await import('blacklist-mock-api');
    return mockModerationApi;
  }
  return liveModerationApi;
}

/** The signed-in member's own submissions (mock in development; not connected otherwise). */
export async function getMemberApi(): Promise<MemberApi> {
  if (process.env.NEXT_PUBLIC_API_MODE === 'mock') {
    const { mockMemberApi } = await import('blacklist-mock-api');
    return mockMemberApi;
  }
  return liveMemberApi;
}

/** The administrator console (mock in development; not connected otherwise). */
export async function getAdminApi(): Promise<AdminApi> {
  if (process.env.NEXT_PUBLIC_API_MODE === 'mock') {
    const { mockAdminApi } = await import('blacklist-mock-api');
    return mockAdminApi;
  }
  return liveAdminApi;
}

/** Restarts the demo data for this browser (mock builds only; does nothing otherwise). */
export async function resetDemoData(): Promise<void> {
  if (process.env.NEXT_PUBLIC_API_MODE !== 'mock') return;
  const { resetMockSession } = await import('blacklist-mock-api');
  await resetMockSession();
}
