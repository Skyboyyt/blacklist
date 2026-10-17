import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';

// ADR 0004: the processor holds nothing worth stealing. It must never import code that
// carries database, auth, provider or configuration access.
const ALLOWED = new Set(['sharp', 'zod', '@blacklist/core']);

it('imports only node built-ins, sharp, zod and @blacklist/core', async () => {
  const dir = join(import.meta.dirname, '../src');
  for (const file of await readdir(dir)) {
    const text = await readFile(join(dir, file), 'utf8');
    for (const [, spec] of text.matchAll(/from '([^']+)'/g)) {
      if (!spec || spec.startsWith('./') || spec.startsWith('node:')) continue;
      expect(ALLOWED.has(spec), `${file} imports ${spec}`).toBe(true);
    }
  }
});

it('reads no secret-looking environment variables', async () => {
  const text = await readFile(join(import.meta.dirname, '../src/main.ts'), 'utf8');
  const names = [...text.matchAll(/^\s+([A-Z][A-Z0-9_]+):/gm)].map(([, name]) => name);
  expect(names).toEqual(['PORT', 'EVIDENCE_STORAGE_ORIGIN', 'S3_BUCKET_QUARANTINE', 'S3_BUCKET_DERIVATIVES']);
});
