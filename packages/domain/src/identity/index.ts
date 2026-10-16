import type { RegistrationAccess } from '@blacklist/config';
import { createDatabase } from '@blacklist/db';
import { createAuth } from './auth.ts';
import { createThrottle, unavailableHumanVerifier, type HumanVerifier } from './throttle.ts';
import { checkBreach, type BreachCheck } from './password-policy.ts';
import type { IdentitySettings, IdentityContext, DeliveryContext } from './types.ts';
export function createDelivery(
  databaseUrl: string,
  origin: string,
  registration: RegistrationAccess,
): DeliveryContext {
  return { runtime: createDatabase(databaseUrl), settings: { origin, registration } };
}
export function createIdentity(
  databaseUrl: string,
  settings: IdentitySettings,
  ports: { human?: HumanVerifier; breach?: BreachCheck } = {},
) {
  const runtime = createDatabase(databaseUrl);
  const ctx: IdentityContext = {
    runtime,
    settings,
    auth: createAuth(runtime.db, settings.secret, settings.origin),
    throttle: createThrottle(runtime, ports.human ?? unavailableHumanVerifier),
    breachCheck: ports.breach ?? checkBreach,
  };
  return ctx;
}
export * from './types.ts';
export * from './login.ts';
export * from './registration.ts';
export * from './requests.ts';
export * from './reset.ts';
export * from './account.ts';
export * from './sessions.ts';
export * from './throttle.ts';
export * from './mailer.ts';
export * from './delivery.ts';
export * from './reads.ts';
export * from './revoke-all.ts';
