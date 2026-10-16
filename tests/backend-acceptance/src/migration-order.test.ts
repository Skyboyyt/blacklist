import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { orderedMigrationFiles } from '../../../packages/db/src/migration-order.ts';

async function fixture(files: Record<string, string>, order: unknown) {
  const dir = await mkdtemp(join(tmpdir(), 'blacklist-order-'));
  await mkdir(join(dir, 'generated'));
  for (const [name, body] of Object.entries(files)) await writeFile(join(dir, name), body);
  await writeFile(join(dir, 'order.json'), JSON.stringify(order));
  return pathToFileURL(dir + '/');
}

describe('single migration order (CR-14 D-2)', () => {
  it('lists every committed migration exactly once, Phase 7 before Phase 8, as staging applied them', async () => {
    const names = (await orderedMigrationFiles()).map((u) => u.pathname.split('/migrations/')[1]);
    expect(names).toEqual([
      'generated/0000_fixed_alex_wilder.sql',
      'generated/0001_rich_tomorrow_man.sql',
      'generated/0002_material_thunderbird.sql',
      'generated/0003_absurd_miek.sql',
      'generated/0004_harsh_molten_man.sql',
      '0001_security_boundaries.sql',
      '0002_identity_guards.sql',
      'generated/0005_violet_stardust.sql',
      '0003_chain_research_foundation.sql',
      '0004_pinned_transaction_time.sql',
      '0005_invalidation_guard.sql',
      'generated/0006_easy_impossible_man.sql',
      'generated/0007_wonderful_boomerang.sql',
      '0007_moderation_guards.sql',
    ]);
  });

  it('refuses an unlisted, missing, duplicate or malformed entry before anything runs', async () => {
    const files = { 'generated/0000_a.sql': 'select 1', '0001_b.sql': 'select 1' };
    const ok = await fixture(files, { files: ['generated/0000_a.sql', '0001_b.sql'] });
    expect((await orderedMigrationFiles(ok)).map((u) => u.pathname.split('/').pop())).toEqual([
      '0000_a.sql',
      '0001_b.sql',
    ]);
    const unlisted = await fixture(files, { files: ['generated/0000_a.sql'] });
    await expect(orderedMigrationFiles(unlisted)).rejects.toThrow('migration_order_incomplete');
    const missing = await fixture(files, { files: ['generated/0000_a.sql', '0001_b.sql', '0002_c.sql'] });
    await expect(orderedMigrationFiles(missing)).rejects.toThrow('migration_order_incomplete');
    const sameName = await fixture(
      { 'generated/0001_b.sql': 'select 1', '0001_b.sql': 'select 1' },
      { files: ['generated/0001_b.sql', '0001_b.sql'] },
    );
    await expect(orderedMigrationFiles(sameName)).rejects.toThrow('migration_order_duplicate');
    for (const bad of [{}, { files: ['../escape.sql'] }, { files: [7] }])
      await expect(orderedMigrationFiles(await fixture(files, bad))).rejects.toThrow(
        'migration_order_invalid',
      );
  });
});
