import { readFile, readdir } from 'node:fs/promises';

/**
 * The one ordered list of migrations (`migrations/order.json`). Fresh and existing
 * databases apply the same sequence, and an unlisted, missing or duplicate file stops
 * the run before anything is applied (review CR-14 D-2).
 */
export async function orderedMigrationFiles(
  root: URL = new URL('../migrations/', import.meta.url),
): Promise<readonly URL[]> {
  const parsed: unknown = JSON.parse(await readFile(new URL('order.json', root), 'utf8'));
  const listed =
    parsed && typeof parsed === 'object' && 'files' in parsed && Array.isArray(parsed.files)
      ? parsed.files
      : null;
  if (
    !listed ||
    listed.some((f) => typeof f !== 'string' || !/^(generated\/)?[0-9]{4}_[a-z0-9_]+\.sql$/u.test(f))
  )
    throw new Error('migration_order_invalid');
  const files = listed as string[];
  const names = files.map((f) => f.split('/').pop());
  // The ledger keys on the file name, so names must be unique across both folders.
  if (new Set(files).size !== files.length || new Set(names).size !== names.length)
    throw new Error('migration_order_duplicate');
  const present = [
    ...(await readdir(new URL('generated/', root)))
      .filter((f) => f.endsWith('.sql'))
      .map((f) => `generated/${f}`),
    ...(await readdir(root)).filter((f) => f.endsWith('.sql')),
  ];
  if (present.length !== files.length || present.some((f) => !files.includes(f)))
    throw new Error('migration_order_incomplete');
  return files.map((f) => new URL(f, root));
}
