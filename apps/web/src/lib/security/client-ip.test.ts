import { describe, expect, it } from 'vitest';
import { clientIpGatewayHeaders, ssrClientIpHeaders, visitorIp } from './client-ip';

const token = 'fictional_client_ip_forwarding_placeholder_123';
const env = { CLIENT_IP_FORWARDING_TOKEN: token };

describe('client IP forwarding to the API', () => {
  it('replaces browser-supplied values with the edge-reported IP and the server secret on /api/v1 only', () => {
    const incoming = new Headers({
      'x-real-ip': '198.51.100.7',
      'x-bl-client-ip': '203.0.113.99',
      'x-bl-client-ip-token': 'attacker-chosen',
    });
    const forwarded = clientIpGatewayHeaders('/api/v1/auth/login', new Headers(incoming), env);
    expect(forwarded.get('x-bl-client-ip')).toBe('198.51.100.7');
    expect(forwarded.get('x-bl-client-ip-token')).toBe(token);
    for (const path of ['/login', '/api/internal/v1/viewer', '/api/v10/auth/login']) {
      const other = clientIpGatewayHeaders(path, new Headers(incoming), env);
      expect(other.has('x-bl-client-ip')).toBe(false);
      expect(other.has('x-bl-client-ip-token')).toBe(false);
    }
  });

  it('forwards nothing without a configured secret and never passes a browser value through', () => {
    const incoming = new Headers({ 'x-real-ip': '198.51.100.7', 'x-bl-client-ip-token': 'attacker-chosen' });
    const forwarded = clientIpGatewayHeaders('/api/v1/auth/login', incoming, {});
    expect(forwarded.has('x-bl-client-ip')).toBe(false);
    expect(forwarded.has('x-bl-client-ip-token')).toBe(false);
  });

  it('fails closed for a malformed or header-injecting secret', () => {
    for (const value of ['short', `${token}\r\nx-injected: true`])
      expect(() =>
        clientIpGatewayHeaders('/api/v1/auth/login', new Headers({ 'x-real-ip': '198.51.100.7' }), {
          CLIENT_IP_FORWARDING_TOKEN: value,
        }),
      ).toThrow('client_ip_forwarding_configuration_invalid');
  });

  it('reads the edge IP from x-real-ip, else the first x-forwarded-for hop, and rejects junk', () => {
    expect(visitorIp(new Headers({ 'x-forwarded-for': '2001:db8::9, 192.0.2.1' }))).toBe('2001:db8::9');
    expect(visitorIp(new Headers({ 'x-real-ip': ' 198.51.100.7 ' }))).toBe('198.51.100.7');
    expect(visitorIp(new Headers({ 'x-real-ip': 'evil.example' }))).toBeNull();
    expect(visitorIp(new Headers())).toBeNull();
    expect(ssrClientIpHeaders(new Headers({ 'x-real-ip': '198.51.100.7' }))).toEqual({
      'x-bl-client-ip': '198.51.100.7',
    });
    expect(ssrClientIpHeaders(new Headers())).toEqual({});
  });
});
