import { expect, test } from 'vitest';
import { assertHeadlessOptions } from './auth.js';

test.each(['bearer', 'jwt', 'passkey', 'token-conversion'])(
  'S17 configuration forbids the %s plugin',
  (id) => {
    expect(() => assertHeadlessOptions({ plugins: [{ id }] })).toThrow('forbidden_auth_configuration');
  },
);
test('headless configuration rejects cached cookies, library rate limiting and account linking', () => {
  for (const options of [
    { session: { cookieCache: { enabled: true } } },
    { rateLimit: { enabled: true } },
    { account: { accountLinking: { enabled: true } } },
  ]) {
    expect(() => assertHeadlessOptions(options)).toThrow('forbidden_auth_configuration');
  }
});
