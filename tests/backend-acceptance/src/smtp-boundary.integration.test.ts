import { createServer, type Socket } from 'node:net';
import { describe, it, expect } from 'vitest';
import { readWorkerConfig } from '@blacklist/config';
import { smtpMailer } from '../../../apps/worker/src/mail/smtp.ts';

async function smtpFixture(reply: '250' | '251' | '451' | '550' | 'disconnect') {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
    socket.write('220 localhost synthetic SMTP\r\n');
    let pending = '',
      body = false;
    socket.on('data', (chunk) => {
      pending += chunk.toString('utf8');
      let at: number;
      while ((at = pending.indexOf('\r\n')) >= 0) {
        const line = pending.slice(0, at);
        pending = pending.slice(at + 2);
        if (body) {
          if (line === '.') {
            body = false;
            socket.write(`${reply === '251' ? '251' : '250'} synthetic message accepted\r\n`);
          }
        } else if (line.startsWith('EHLO')) socket.write('250 localhost\r\n');
        else if (line.startsWith('MAIL FROM:')) {
          if (reply === 'disconnect') socket.destroy();
          else socket.write(reply === '451' ? '451 synthetic temporary rejection\r\n' : '250 OK\r\n');
        } else if (line.startsWith('RCPT TO:'))
          socket.write(reply === '550' ? '550 synthetic recipient rejection\r\n' : '250 OK\r\n');
        else if (line === 'DATA') {
          body = true;
          socket.write('354 End with dot\r\n');
        } else if (line === 'QUIT') socket.end('221 Bye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture_port_missing');
  return {
    port: address.port,
    async stop() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
describe('real SMTP final acceptance and sanitized rejection boundaries', () => {
  for (const reply of ['250', '251', '451', '550', 'disconnect'] as const) {
    it(`handles synthetic SMTP ${reply} without fabricated delivery acceptance`, async () => {
      const fixture = await smtpFixture(reply);
      try {
        const mailer = smtpMailer(
          readWorkerConfig({
            NODE_ENV: 'test',
            DATABASE_URL: 'postgresql://fictional@localhost/fictional',
            APP_ORIGIN: 'http://localhost:3000',
            WEBAUTHN_RP_ID: 'localhost',
            EMAIL_PROVIDER: 'smtp',
            SMTP_HOST: '127.0.0.1',
            SMTP_PORT: String(fixture.port),
            SMTP_SECURE: 'false',
            EMAIL_FROM: 'security@example.test',
          }),
        );
        const outcome = await mailer.send({
          recipient: 'synthetic@example.test',
          subject: 'Synthetic security fixture',
          text: 'No tokens or passwords in this message',
        });
        expect(outcome.outcome).toBe(
          reply === '250'
            ? 'accepted_for_delivery'
            : reply === '251' || reply === '550'
              ? 'permanent_failure'
              : 'retryable_failure',
        );
        if (outcome.outcome === 'accepted_for_delivery')
          expect(outcome.providerMessageId.length > 0).toBe(true);
        else {
          expect(outcome).not.toHaveProperty('providerMessageId');
          expect(outcome.code).toBe(reply === 'disconnect' ? 'transport' : 'rejected');
        }
        expect(JSON.stringify(outcome).includes('synthetic recipient rejection')).toBe(false);
      } finally {
        await fixture.stop();
      }
    });
  }
});
