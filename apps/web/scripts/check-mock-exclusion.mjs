// Verifies that mock code and fixtures are absent from the production build and
// that server-only names never appear in browser bundles.
//
//   pnpm build && pnpm build:mock && pnpm check:mock-exclusion
//
// The mock build must CONTAIN the marker, proving the scan can see mock code.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MARKERS = [
  'BLACKLIST_MOCK_FIXTURE_DO_NOT_SHIP',
  'DemoTokenMintBLackListFixture',
  'b1ac000000000000000000000000000000000004',
  // Phase 2 account and staff security fixtures.
  'sess_demo_phone',
  'DEMO2026AB',
  'auth_demo_passkey',
];
const SERVER_ONLY_NAMES = ['INTERNAL_API_TOKEN', 'API_INTERNAL_URL', 'BETTER_AUTH_SECRET', 'DATABASE_URL'];
const TEXT = /\.(js|mjs|cjs|html|json|rsc|body|txt|map)$/;

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'cache') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...files(full));
    else if (TEXT.test(name)) out.push(full);
  }
  return out;
}

function scan(dir, needles) {
  const hits = [];
  for (const file of files(dir)) {
    const text = readFileSync(file, 'utf8');
    for (const needle of needles) if (text.includes(needle)) hits.push(`${needle} in ${file}`);
  }
  return hits;
}

let failed = false;
for (const dir of ['.next', '.next-mock']) {
  if (!existsSync(dir)) {
    console.error(`Missing ${dir}: run "pnpm build" and "pnpm build:mock" first.`);
    process.exit(2);
  }
}

const prodHits = scan('.next', MARKERS);
if (prodHits.length > 0) {
  failed = true;
  console.error('FAIL: mock code or fixtures found in the production build:\n  ' + prodHits.join('\n  '));
} else {
  console.log('PASS: production build contains no mock markers or fixtures.');
}

const mockHits = scan('.next-mock', [MARKERS[0]]);
if (mockHits.length === 0) {
  failed = true;
  console.error('FAIL: the mock build does not contain the marker, so this check cannot be trusted.');
} else {
  console.log('PASS: mock build contains the marker (the scan sees mock code).');
}

for (const dir of ['.next/static', '.next-mock/static']) {
  const leaks = scan(dir, SERVER_ONLY_NAMES);
  if (leaks.length > 0) {
    failed = true;
    console.error(`FAIL: server-only names in browser bundles (${dir}):\n  ` + leaks.join('\n  '));
  } else {
    console.log(`PASS: no server-only names in ${dir}.`);
  }
}

process.exit(failed ? 1 : 0);
