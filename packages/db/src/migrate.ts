import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { PgBoss } from 'pg-boss';
import { executor } from './client.ts';
import { identityQueues } from './queues.ts';
import { orderedMigrationFiles } from './migration-order.ts';

// Operator command only. Never called from API/worker startup.
export async function migrate(connectionString: string, runtimeRole: string) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(runtimeRole)) throw new Error('invalid_runtime_role');
  const pool = new Pool({
    connectionString,
    max: 1,
    options: '-c lock_timeout=5000 -c statement_timeout=60000',
  });
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(730025)');
    await client.query('CREATE SCHEMA IF NOT EXISTS blacklist_migrations');
    await client.query(
      'CREATE TABLE IF NOT EXISTS blacklist_migrations.applied (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const files = await orderedMigrationFiles();
    for (const file of files) {
      const name = file.pathname.split('/').pop();
      const source = await readFile(file, 'utf8');
      const sha256 = createHash('sha256').update(source).digest('hex');
      const prior = await client.query<{ sha256: string }>(
        'SELECT sha256 FROM blacklist_migrations.applied WHERE name=$1',
        [name],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].sha256 !== sha256) throw new Error('applied_migration_changed');
        continue;
      }
      const outside = source.startsWith('-- transaction: off\n');
      if (!outside) await client.query('BEGIN');
      try {
        await client.query(source);
        await client.query('INSERT INTO blacklist_migrations.applied(name,sha256) VALUES ($1,$2)', [
          name,
          sha256,
        ]);
        if (!outside) await client.query('COMMIT');
      } catch (error) {
        if (!outside) await client.query('ROLLBACK');
        throw error;
      }
    }
    const provisioner = new PgBoss({ db: executor(client), supervise: false, schedule: false });
    provisioner.on('error', () => {
      console.error('queue_provisioning_failed');
    });
    await provisioner.start();
    try {
      for (const name of identityQueues) {
        await provisioner.createQueue(`${name}.dead`);
        await provisioner.createQueue(name, {
          retryLimit: 4,
          retryDelay: 5,
          retryBackoff: true,
          expireInSeconds: 60,
          retentionSeconds: 86400,
          deadLetter: `${name}.dead`,
        });
      }
    } finally {
      await provisioner.stop();
    }
    // Identifier checked above. Never interpolate unvalidated identifiers.
    await client.query(`GRANT USAGE ON SCHEMA blacklist,pgboss TO ${runtimeRole};
      GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA blacklist,pgboss TO ${runtimeRole};
      GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA pgboss TO ${runtimeRole};
      REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON blacklist.audit_log FROM ${runtimeRole};
      REVOKE UPDATE,DELETE,TRUNCATE ON blacklist.security_email_deliveries FROM ${runtimeRole};
      REVOKE ALL ON blacklist.auth_verifications FROM ${runtimeRole};
      REVOKE DELETE,TRUNCATE ON blacklist.staff_recovery_objections FROM ${runtimeRole};
      REVOKE UPDATE,DELETE,TRUNCATE ON blacklist.report_status_history,blacklist.moderation_case_notes,
        blacklist.finding_revisions,blacklist.finding_approval_events,blacklist.finding_publication_events,
        blacklist.moderation_decisions,blacklist.decision_evidence,blacklist.finding_status_history,
        blacklist.evidence_custody_events FROM ${runtimeRole};
      REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON blacklist.chains FROM ${runtimeRole};
      REVOKE UPDATE,DELETE,TRUNCATE ON blacklist.verification_receipts,blacklist.chain_fact_verifications,
        blacklist.chain_transactions,blacklist.asset_transfers,blacklist.chain_fact_invalidations FROM ${runtimeRole};
      GRANT EXECUTE ON FUNCTION blacklist.append_audit(jsonb) TO ${runtimeRole};
      GRANT EXECUTE ON FUNCTION blacklist.canonical_json(jsonb) TO ${runtimeRole};
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO ${runtimeRole}`);
  } finally {
    await client.query('SELECT pg_advisory_unlock(730025)');
    client.release();
    await pool.end();
  }
}
