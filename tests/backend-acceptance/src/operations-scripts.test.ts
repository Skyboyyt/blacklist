import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const root = new URL('../../../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

describe('Neon apply scripts embed the committed migrations exactly', () => {
  it('0007: both files verbatim, with matching ledger checksums', async () => {
    const script = await read('docs/operations/2026-10-16-apply-0007-phase9a.sql');
    for (const [path, name] of [
      ['packages/db/migrations/generated/0007_smiling_quentin_quire.sql', '0007_smiling_quentin_quire.sql'],
      ['packages/db/migrations/0007_moderation_guards.sql', '0007_moderation_guards.sql'],
    ] as const) {
      const source = await read(path);
      expect(script).toContain(source.trimEnd());
      expect(script).toContain(`('${name}', '${createHash('sha256').update(source).digest('hex')}')`);
    }
  });
  it('0008: both files verbatim, with matching ledger checksums', async () => {
    const script = await read('docs/operations/2026-10-17-apply-0008-risk.sql');
    for (const [path, name] of [
      ['packages/db/migrations/generated/0008_sleepy_white_tiger.sql', '0008_sleepy_white_tiger.sql'],
      ['packages/db/migrations/0008_risk_guards.sql', '0008_risk_guards.sql'],
    ] as const) {
      const source = await read(path);
      expect(script).toContain(source.trimEnd());
      expect(script).toContain(`('${name}', '${createHash('sha256').update(source).digest('hex')}')`);
    }
  });
  it('0009: both files verbatim, with matching ledger checksums', async () => {
    const script = await read('docs/operations/2026-10-17-apply-0009-projects.sql');
    for (const [path, name] of [
      ['packages/db/migrations/generated/0009_fresh_shen.sql', '0009_fresh_shen.sql'],
      ['packages/db/migrations/0009_project_guards.sql', '0009_project_guards.sql'],
    ] as const) {
      const source = await read(path);
      expect(script).toContain(source.trimEnd());
      expect(script).toContain(`('${name}', '${createHash('sha256').update(source).digest('hex')}')`);
    }
  });
  it('0010: both files verbatim, with matching ledger checksums', async () => {
    const script = await read('docs/operations/2026-10-17-apply-0010-admin.sql');
    for (const [path, name] of [
      ['packages/db/migrations/generated/0010_condemned_hercules.sql', '0010_condemned_hercules.sql'],
      ['packages/db/migrations/0010_admin_guards.sql', '0010_admin_guards.sql'],
    ] as const) {
      const source = await read(path);
      expect(script).toContain(source.trimEnd());
      expect(script).toContain(`('${name}', '${createHash('sha256').update(source).digest('hex')}')`);
    }
  });
  it('0011: both files verbatim, with matching ledger checksums', async () => {
    const script = await read('docs/operations/2026-10-17-apply-0011-evidence.sql');
    expect(script).toContain('<> 20 THEN');
    for (const [path, name] of [
      ['packages/db/migrations/generated/0011_woozy_weapon_omega.sql', '0011_woozy_weapon_omega.sql'],
      ['packages/db/migrations/0011_evidence_guards.sql', '0011_evidence_guards.sql'],
    ] as const) {
      const source = await read(path);
      expect(script).toContain(source.trimEnd());
      expect(script).toContain(`('${name}', '${createHash('sha256').update(source).digest('hex')}')`);
    }
  });
});
