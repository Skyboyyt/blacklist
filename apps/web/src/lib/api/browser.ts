import {
  notConnectedAccountApi,
  notConnectedAuthApi,
  notConnectedHumanVerifier,
  notConnectedModerationApi,
  notConnectedStaffSecurityApi,
} from './not-connected';
import type { AccountApi, AuthApi, HumanVerifierClient, ModerationApi, StaffSecurityApi } from './types';

/** Auth API for client components (browser). */
export async function getAuthApi(): Promise<AuthApi> {
  if (process.env.NEXT_PUBLIC_API_MODE === 'mock') {
    const { mockAuthApi } = await import('blacklist-mock-api');
    return mockAuthApi;
  }
  return notConnectedAuthApi;
}

/** Signed-in account and security API for client components. */
export async function getAccountApi(): Promise<AccountApi> {
  if (process.env.NEXT_PUBLIC_API_MODE === 'mock') {
    const { mockAccountApi } = await import('blacklist-mock-api');
    return mockAccountApi;
  }
  return notConnectedAccountApi;
}

/** Staff security API for client components. */
export async function getStaffSecurityApi(): Promise<StaffSecurityApi> {
  if (process.env.NEXT_PUBLIC_API_MODE === 'mock') {
    const { mockStaffSecurityApi } = await import('blacklist-mock-api');
    return mockStaffSecurityApi;
  }
  return notConnectedStaffSecurityApi;
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
  return notConnectedModerationApi;
}
