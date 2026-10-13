import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { executor, startDatabase, type Harness } from './database.js';

let h: Harness;
beforeAll(async () => {
  h = await startDatabase();
});
afterAll(async () => {
  if (h) await h.stop();
});

test('D1: generated SQL has reviewed identity/audit types, CHECKs, partial uniques and composite FKs', async () => {
  const directory = new URL('../fixtures/generated/', import.meta.url);
  const files = (await readdir(directory)).filter((name) => name.endsWith('.sql'));
  expect(files.length).toBeGreaterThan(0);
  const generated = (await Promise.all(files.map((file) => readFile(new URL(file, directory), 'utf8')))).join(
    '\n',
  );
  for (const marker of [
    'timestamp with time zone',
    'uuidv7()',
    'CHECK',
    'FOREIGN KEY',
    '"session_id","user_id"',
    'WHERE',
    '"subject_id","assessment_id"',
  ])
    expect(generated).toContain(marker);
  const tables = await h.runtime.query(
    "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'gate'",
  );
  expect(tables.rows[0]?.count).toBe(17);
});
test('D2/D9: append function works; grants and triggers deny application tampering', async () => {
  await h.runtime.query("SELECT gate.append_audit('gate.test', uuidv7(), '{}'::jsonb)");
  await expect(h.runtime.query('INSERT INTO gate.audit_log (seq) VALUES (99)')).rejects.toMatchObject({
    code: '42501',
  });
  await expect(h.runtime.query("UPDATE gate.audit_log SET action = 'tampered'")).rejects.toMatchObject({
    code: '42501',
  });
  await expect(h.runtime.query('DELETE FROM gate.audit_log')).rejects.toMatchObject({ code: '42501' });
  await expect(h.migrator.query("UPDATE gate.audit_log SET action = 'tampered'")).rejects.toMatchObject({
    code: '42501',
  });
  await expect(h.migrator.query('DELETE FROM gate.audit_log')).rejects.toMatchObject({ code: '42501' });
  await h.runtime.query(
    "INSERT INTO gate.security_email_deliveries (entity_id, generation, outcome) VALUES (uuidv7(), 1, 'accepted_for_delivery')",
  );
  for (const client of [h.runtime, h.migrator]) {
    await expect(
      client.query('UPDATE gate.security_email_deliveries SET generation = 2'),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(client.query('DELETE FROM gate.security_email_deliveries')).rejects.toMatchObject({
      code: '42501',
    });
  }
  const audit = await h.runtime.query('SELECT row_hash, prev_hash FROM gate.audit_log');
  expect(audit.rows[0]?.row_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(audit.rows[0]?.prev_hash).toBe('0'.repeat(64));
  const encoded = await h.runtime.query<{
    prev_hash: string;
    row_hash: string;
    event: unknown;
  }>(`SELECT prev_hash, row_hash,
    jsonb_build_object('seq', seq, 'id', id, 'occurred_at', to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'action', action, 'target_id', target_id, 'details', details) AS event
    FROM gate.audit_log ORDER BY seq`);
  for (const row of encoded.rows) {
    const computed = createHash('sha256')
      .update(row.prev_hash + canonical(row.event))
      .digest('hex');
    expect(computed === row.row_hash).toBe(true);
  }
});
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('invalid_audit_json');
  return encoded;
}
test('D3: transaction rollback and nontransactional CONCURRENTLY path', async () => {
  const client = await h.migrator.connect();
  try {
    await client.query('BEGIN');
    await expect(
      client.query('CREATE INDEX CONCURRENTLY gate_email_idx ON gate.auth_users (email)'),
    ).rejects.toMatchObject({ code: '25001' });
    await client.query('ROLLBACK');
    await client.query('CREATE INDEX CONCURRENTLY gate_email_idx ON gate.auth_users (email)');
    const index = await client.query(
      "SELECT indisvalid FROM pg_index WHERE indexrelid = 'gate.gate_email_idx'::regclass",
    );
    expect(index.rows[0]?.indisvalid).toBe(true);
  } finally {
    client.release();
  }
});
test('D4: subtype, owner and current-assessment composite foreign keys reject mismatches with typed SQLSTATE', async () => {
  const subject = await h.runtime.query<{ id: string }>(
    "INSERT INTO gate.subjects (kind) VALUES ('project') RETURNING id",
  );
  await expect(
    h.runtime.query('INSERT INTO gate.addresses (id) VALUES ($1)', [subject.rows[0]?.id]),
  ).rejects.toMatchObject({ code: '23503', constraint: 'addresses_id_kind_subjects_id_kind_fk' });
  const a = await h.runtime.query<{ id: string }>(
    "INSERT INTO gate.subjects (kind) VALUES ('address') RETURNING id",
  );
  const assessment = await h.runtime.query<{ id: string }>(
    'INSERT INTO gate.risk_assessments (subject_id) VALUES ($1) RETURNING id',
    [a.rows[0]?.id],
  );
  await expect(
    h.runtime.query('INSERT INTO gate.current_risk_assessments VALUES ($1, $2)', [
      subject.rows[0]?.id,
      assessment.rows[0]?.id,
    ]),
  ).rejects.toMatchObject({ code: '23503' });
  await expect(
    h.runtime.query(
      'INSERT INTO gate.session_policy_state VALUES (uuidv7(), uuidv7(), $1, 1, now(), now())',
      ['member'],
    ),
  ).rejects.toMatchObject({ code: '23503', constraint: 'policy_owner' });
  const owners = await h.runtime.query<{ id: string }>(
    "INSERT INTO gate.auth_users (name, email, email_verified) VALUES ('Gate A', 'owner-a@example.test', true), ('Gate B', 'owner-b@example.test', true) RETURNING id",
  );
  const parent = await h.runtime.query<{ id: string }>(
    "INSERT INTO gate.auth_sessions (user_id, token, expires_at) VALUES ($1, $2, now() + interval '1 hour') RETURNING id",
    [owners.rows[0]?.id, randomBytes(32).toString('base64url')],
  );
  await expect(
    h.runtime.query(
      "INSERT INTO gate.session_policy_state (session_id, user_id, account_kind, security_version) VALUES ($1, $2, 'member', 1)",
      [parent.rows[0]?.id, owners.rows[1]?.id],
    ),
  ).rejects.toMatchObject({ code: '23503', constraint: 'policy_owner' });
});
test('D6: same pg client enqueues through a Drizzle transaction; rollback leaves no job', async () => {
  let rolledBack: string | null = null;
  await expect(
    h.transaction(async (tx, client) => {
      await tx.execute(sql`select 1`);
      rolledBack = await h.boss.send(
        'identity.security_notice',
        { accountId: 'rollback-fixture' },
        { db: executor(client) },
      );
      throw new Error('injected_rollback');
    }),
  ).rejects.toThrow('injected_rollback');
  const none = await h.runtime.query('SELECT count(*)::int AS count FROM pgboss.job WHERE id = $1', [
    rolledBack,
  ]);
  expect(none.rows[0]?.count).toBe(0);
  const committed = await h.transaction(async (tx, client) => {
    await tx.execute(sql`select 1`);
    return h.boss.send('identity.security_notice', { accountId: 'commit-fixture' }, { db: executor(client) });
  });
  const one = await h.runtime.query('SELECT count(*)::int AS count FROM pgboss.job WHERE id = $1', [
    committed,
  ]);
  expect(one.rows[0]?.count).toBe(1);
});
test('D7: migrator-owned pg-boss starts and fetches jobs as a DML-only runtime login', async () => {
  const role = await h.runtime.query('SELECT current_user');
  expect(role.rows[0]?.current_user).toBe('gate_runtime');
  await expect(h.runtime.query('CREATE SCHEMA unauthorized')).rejects.toMatchObject({ code: '42501' });
  await expect(h.runtime.query('CREATE TABLE gate.unauthorized (id integer)')).rejects.toMatchObject({
    code: '42501',
  });
  await expect(h.runtime.query('CREATE TEMPORARY TABLE unauthorized (id integer)')).rejects.toMatchObject({
    code: '42501',
  });
  await expect(
    h.runtime.query('ALTER TABLE gate.auth_users ADD COLUMN unauthorized integer'),
  ).rejects.toMatchObject({ code: '42501' });
  const boss = new PgBoss({
    db: executor(h.runtime),
    migrate: false,
    createSchema: false,
    supervise: false,
    schedule: false,
  });
  boss.on('error', () => {
    /* assertions test the runtime operation */
  });
  await boss.start();
  try {
    const jobs = await boss.fetch('identity.security_notice');
    expect(jobs.length).toBeGreaterThan(0);
    for (const job of jobs) await boss.complete('identity.security_notice', job.id);
  } finally {
    await boss.stop();
  }
});
test('D5: forward fixture restore rehearsal preserves data and audit hash chain', async () => {
  const before = await h.runtime.query('SELECT row_hash FROM gate.audit_log ORDER BY seq');
  execFileSync('docker', [
    'exec',
    h.container,
    'pg_dump',
    '-U',
    'postgres',
    '--format=custom',
    '--file=/tmp/gates.dump',
    'postgres',
  ]);
  execFileSync('docker', ['exec', h.container, 'createdb', '-U', 'postgres', 'restore_gates']);
  execFileSync('docker', [
    'exec',
    h.container,
    'pg_restore',
    '-U',
    'postgres',
    '--exit-on-error',
    '--dbname=restore_gates',
    '/tmp/gates.dump',
  ]);
  const restored = execFileSync(
    'docker',
    [
      'exec',
      h.container,
      'psql',
      '-U',
      'postgres',
      '-d',
      'restore_gates',
      '-Atc',
      'SELECT row_hash FROM gate.audit_log ORDER BY seq',
    ],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n');
  expect(restored).toEqual(before.rows.map((row: { row_hash: string }) => row.row_hash));
});
