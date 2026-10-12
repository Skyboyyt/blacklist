import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy } from './csp';

describe('Content Security Policy', () => {
  const prod = buildContentSecurityPolicy('abc123', false, 'blacklist.example');

  it('uses a nonce with strict-dynamic and no unsafe script sources in production', () => {
    expect(prod).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    const scriptSrc = prod.split('; ').find((d) => d.startsWith('script-src')) ?? '';
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');
  });

  it('includes the ARCHITECTURE §26.1 baseline directives', () => {
    for (const directive of [
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ]) {
      expect(prod).toContain(directive);
    }
  });

  it('requires a nonce for <style> elements in production (no unsafe-inline style blocks)', () => {
    const styleSrc = prod.split('; ').find((d) => d.startsWith('style-src '));
    expect(styleSrc).toBe("style-src 'self' 'nonce-abc123'");
    expect(prod).toContain("style-src-attr 'unsafe-inline'");
  });

  it('upgrades insecure requests on real hosts but not on loopback (WebKit applies it to localhost)', () => {
    expect(buildContentSecurityPolicy('n', false, 'blacklist.example')).toContain(
      'upgrade-insecure-requests',
    );
    expect(buildContentSecurityPolicy('n', false, 'localhost')).not.toContain('upgrade-insecure-requests');
    expect(buildContentSecurityPolicy('n', false, '127.0.0.1')).not.toContain('upgrade-insecure-requests');
  });

  it('only relaxes eval and websockets in development', () => {
    const dev = buildContentSecurityPolicy('abc123', true);
    expect(dev).toContain("'unsafe-eval'");
    expect(prod).not.toContain('ws:');
  });
});
