import type { RegistrationAccess } from '@blacklist/config';
import type { DatabaseRuntime } from '@blacklist/db';
import type { IdentityAuth } from './auth.ts';
import type { createThrottle } from './throttle.ts';
import type { BreachCheck } from './password-policy.ts';
export interface IdentitySettings {
  secret: string;
  origin: string;
  rpId: string;
  rpName: string;
  breakGlassEnabled: boolean;
  registration: RegistrationAccess;
}
export interface IdentityContext {
  runtime: DatabaseRuntime;
  settings: IdentitySettings;
  auth: IdentityAuth;
  throttle: ReturnType<typeof createThrottle>;
  breachCheck: BreachCheck;
}
export interface DeliveryContext {
  runtime: DatabaseRuntime;
  settings: { origin: string; registration: RegistrationAccess };
}
