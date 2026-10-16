import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const root = new URL('../../../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

describe('Neon apply scripts embed the committed migrations exactly', () => {
  it('0007: both files verbatim, with matching ledger checksums', async () => {
    const script = await read('docs/operations/2026-10-16-apply-0007-phase9a.sql');
    for (const [path, name] of [
      ['packages/db/migrations/generated/0007_wonderful_boomerang.sql', '0007_wonderful_boomerang.sql'],
      ['packages/db/migrations/0007_moderation_guards.sql', '0007_moderation_guards.sql'],
    ] as const) {
      const source = await read(path);
      expect(script).toContain(source.trimEnd());
      expect(script).toContain(`('${name}', '${createHash('sha256').update(source).digest('hex')}')`);
    }
  });
});
