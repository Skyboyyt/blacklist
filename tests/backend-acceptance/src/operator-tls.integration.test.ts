import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createConnection, createServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSecureContext, TLSSocket } from 'node:tls';
import { expect, it } from 'vitest';
import { withVerifiedOperatorConnection } from '../../../packages/db/src/staging-operator.ts';
import { startDatabase } from './database.ts';

it('verifies TLS at a PostgreSQL proxy independently of compute SSL and rejects bad CA/hostname', async () => {
  const h = await startDatabase();
  const directory = await mkdtemp(join(tmpdir(), 'blacklist-proxy-tls-'));
  const sockets = new Set<Socket>();
  const servers: ReturnType<typeof createServer>[] = [];
  const password = randomBytes(32).toString('hex');
  function openssl(args: string[]) {
    execFileSync('openssl', args, { cwd: directory, stdio: 'ignore' });
  }
  try {
    const result = await h.admin.query<{ command: string }>(
      "SELECT format('ALTER ROLE postgres PASSWORD %L', $1::text) AS command",
      [password],
    );
    const command = result.rows[0]?.command;
    if (!command) throw new Error('fixture_command_missing');
    await h.admin.query(command);
    openssl([
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '2',
      '-subj',
      '/CN=Temporary Test CA',
      '-keyout',
      'ca.key',
      '-out',
      'ca.crt',
    ]);
    openssl([
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '2',
      '-subj',
      '/CN=Wrong Test CA',
      '-keyout',
      'wrong-ca.key',
      '-out',
      'wrong-ca.crt',
    ]);
    async function proxy(name: string, san: string) {
      openssl([
        'req',
        '-new',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-subj',
        '/CN=' + name,
        '-keyout',
        name + '.key',
        '-out',
        name + '.csr',
      ]);
      await writeFile(join(directory, name + '.ext'), 'subjectAltName=' + san + '\n');
      openssl([
        'x509',
        '-req',
        '-in',
        name + '.csr',
        '-CA',
        'ca.crt',
        '-CAkey',
        'ca.key',
        '-CAcreateserial',
        '-days',
        '2',
        '-extfile',
        name + '.ext',
        '-out',
        name + '.crt',
      ]);
      const context = createSecureContext({
        key: await readFile(join(directory, name + '.key')),
        cert: await readFile(join(directory, name + '.crt')),
      });
      const server = createServer((socket) => {
        sockets.add(socket);
        socket.on('error', () => socket.destroy());
        socket.once('data', (request) => {
          if (!request.equals(Buffer.from('0000000804d2162f', 'hex'))) {
            socket.destroy();
            return;
          }
          socket.write('S');
          const secure = new TLSSocket(socket, { isServer: true, secureContext: context });
          sockets.add(secure);
          secure.on('error', () => secure.destroy());
          secure.once('secure', () => {
            const backend = createConnection({ host: '127.0.0.1', port: h.port });
            sockets.add(backend);
            backend.on('error', () => secure.destroy());
            secure.pipe(backend).pipe(secure);
            secure.once('close', () => backend.destroy());
          });
        });
      });
      servers.push(server);
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('fixture_address_missing');
      const url = new URL(`postgresql://127.0.0.1:${address.port}/postgres?sslmode=verify-full`);
      url.username = 'postgres';
      url.password = password;
      // Lower-level connector fixture only. The production target guard rejects CA overrides.
      url.searchParams.set('sslrootcert', join(directory, 'ca.crt'));
      return url;
    }
    const good = await proxy('valid', 'IP:127.0.0.1,DNS:localhost');
    const proof = await withVerifiedOperatorConnection(
      good.toString(),
      'postgres',
      'postgres',
      async (client, transport) => ({
        ...transport,
        n: (await client.query<{ n: number }>('SELECT 1 AS n')).rows[0]?.n,
      }),
    );
    expect(proof).toEqual({ serverReportsTls: false, n: 1 });
    const badCA = new URL(good);
    badCA.searchParams.set('sslrootcert', join(directory, 'wrong-ca.crt'));
    let callbackCalled = false;
    await expect(
      withVerifiedOperatorConnection(badCA.toString(), 'postgres', 'postgres', async () => {
        callbackCalled = true;
      }),
    ).rejects.toThrow();
    expect(callbackCalled).toBe(false);
    const wrongHost = await proxy('invalid', 'DNS:wrong.example.test');
    await expect(
      withVerifiedOperatorConnection(wrongHost.toString(), 'postgres', 'postgres', async () => {
        callbackCalled = true;
      }),
    ).rejects.toMatchObject({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
    expect(callbackCalled).toBe(false);
  } finally {
    for (const socket of sockets) socket.destroy();
    await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    await h.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
