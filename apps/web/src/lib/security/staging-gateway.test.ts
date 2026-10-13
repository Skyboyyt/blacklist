import { describe, expect, it } from 'vitest';
import { stagingAccessHeaders, stagingGatewayHeaders } from './staging-gateway';

const token = 'fictional_staging_transport_placeholder_12345';
const env = { DEPLOYMENT_ENV: 'staging', STAGING_ACCESS_TOKEN: token };
describe('staging gateway transport boundary', () => {
  it('replaces browser-supplied staging credentials only on the same-origin API path', () => {
    const input = new Headers({
      'x-blacklist-staging-access': 'attacker-chosen',
      origin: 'https://staging.example.test',
    });
    const forwarded = stagingGatewayHeaders('/api/v1/auth/login', input, env);
    expect(forwarded.get('x-blacklist-staging-access')).toBe(token);
    expect(forwarded.get('origin')).toBe('https://staging.example.test');
    expect(input.get('x-blacklist-staging-access')).toBe('attacker-chosen');
    for (const path of ['/login', '/api/internal/v1/viewer', '/api/v10/auth/login'])
      expect(stagingGatewayHeaders(path, input, env).has('x-blacklist-staging-access')).toBe(false);
  });
  it('fails closed for missing, short or header-injecting secrets without exporting them', () => {
    for (const value of [undefined, 'short', `${token}\r\nx-injected: true`]) {
      const invalid = { DEPLOYMENT_ENV: 'staging', STAGING_ACCESS_TOKEN: value };
      expect(() => stagingGatewayHeaders('/api/v1/auth/login', new Headers(), invalid)).toThrow(
        'staging_access_configuration_invalid',
      );
    }
  });
  it('keeps local/mock transport free of staging credentials and supplies SSR only in staging', () => {
    const incoming = new Headers({ 'x-blacklist-staging-access': 'attacker-chosen' });
    expect(stagingGatewayHeaders('/api/v1/auth/login', incoming, {}).has('x-blacklist-staging-access')).toBe(
      false,
    );
    expect(stagingAccessHeaders({})).toEqual({});
    expect(stagingAccessHeaders(env)).toEqual({ 'x-blacklist-staging-access': token });
  });
});
