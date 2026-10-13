import { randomBytes, randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readWorkerConfig } from '@blacklist/config';
import { resendMailer } from '../../../apps/worker/src/mail/resend.ts';
import { smtpMailer } from '../../../apps/worker/src/mail/smtp.ts';

const key = randomBytes(32).toString('base64url');
const workerEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://fictional@localhost/fictional',
  APP_ORIGIN: 'https://staging.example.test',
  WEBAUTHN_RP_ID: 'staging.example.test',
  EMAIL_PROVIDER: 'resend',
  RESEND_API_KEY: key,
  EMAIL_FROM: 'security@example.test',
};
const config = () => readWorkerConfig(workerEnv);
const message = {
  recipient: 'synthetic@example.test',
  subject: 'Synthetic security test',
  text: 'fictional message',
};
afterEach(() => vi.unstubAllGlobals());
describe('Resend HTTPS security mail acceptance (controlled provider responses)', () => {
  it('requires a real validated provider receipt, a fixed TLS endpoint and redirect rejection', async () => {
    const id = randomUUID();
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    expect(await resendMailer(config()).send(message)).toEqual({
      outcome: 'accepted_for_delivery',
      providerMessageId: id,
    });
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.resend.com/emails');
    const request = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(request.method).toBe('POST');
    expect(request.redirect).toBe('error');
    expect(request.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(request.body))).toEqual({
      from: 'security@example.test',
      to: [message.recipient],
      subject: message.subject,
      text: message.text,
    });
    expect(new Headers(request.headers).get('authorization')).toBe(`Bearer ${key}`);
  });
  it('never activates a token from an empty, invalid, extra-field or oversized success body', async () => {
    for (const body of [
      '',
      '{}',
      '{"id":"invalid"}',
      JSON.stringify({ id: randomUUID(), token: 'unexpected' }),
      'x'.repeat(8193),
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
      const outcome = await resendMailer(config()).send(message);
      expect(outcome.outcome).toBe('retryable_failure');
      expect(outcome).not.toHaveProperty('providerMessageId');
    }
  });
  it('retries rate limits/outages and permanently rejects other HTTP errors without reflecting private bodies', async () => {
    for (const status of [408, 429, 500, 503, 400, 401, 403, 422, 302, 202]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(`private ${key}`, { status })));
      const result = await resendMailer(config()).send(message);
      expect(result.outcome).toBe(
        [408, 429, 500, 503].includes(status) ? 'retryable_failure' : 'permanent_failure',
      );
      expect(JSON.stringify(result)).not.toContain(key);
      expect(result).not.toHaveProperty('providerMessageId');
    }
  });
  it('treats network failures and invalid configuration as failures, retaining SMTP requirements', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(`private ${key}`)));
    expect(await resendMailer(config()).send(message)).toEqual({
      outcome: 'retryable_failure',
      code: 'transport',
    });
    expect(() => readWorkerConfig({ ...workerEnv, RESEND_API_KEY: undefined })).toThrow('RESEND_API_KEY');
    expect(() => readWorkerConfig({ ...workerEnv, EMAIL_PROVIDER: 'smtp', SMTP_HOST: undefined })).toThrow(
      'SMTP_HOST',
    );
    expect(() => smtpMailer(config())).toThrow('smtp_mailer_configuration_invalid');
    expect(() => readWorkerConfig({ ...workerEnv, APP_ORIGIN: 'http://localhost:3000' })).toThrow('HTTPS');
    expect(() =>
      readWorkerConfig({
        ...workerEnv,
        EMAIL_PROVIDER: 'smtp',
        SMTP_HOST: 'localhost',
        SMTP_PORT: '1025',
        SMTP_SECURE: 'false',
      }),
    ).toThrow('SMTP_SECURE');
  });
});
