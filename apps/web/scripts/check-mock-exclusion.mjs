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
  // Phase 3 project fixtures.
  'DemoDaoTreasuryBLackListFixture',
  'rewards-hub.example',
  'demo-provider-down',
  // Phase 4 staff moderation fixtures.
  'Reporter R-7781',
  'demo_appeal_reviewer',
  // Phase 5 member submission service and shared demo store.
  'SIMULATED in the demo:',
  'only the file name, type and size were recorded',
  // Phase 5 follow-up: administrator console fixtures.
  'demo_flooder',
  'Demo bridge router contract',
  // Phase 6: finding revisions and staff recovery verification (mock services).
  'Fixture: revision published before the demo started.',
  'At least one of the two verifiers must be an administrator.',
];
const SERVER_ONLY_NAMES = [
  'INTERNAL_API_TOKEN',
  'CLIENT_IP_FORWARDING_TOKEN',
  'API_INTERNAL_URL',
  'CANONICAL_APP_ORIGIN',
  'MAIL_WORKER_HEALTH_URL',
  'BETTER_AUTH_SECRET',
  'DATABASE_URL',
  'ALCHEMY_ETHEREUM_API_KEY',
  'HELIUS_RPC_API_KEY',
  'ALCHEMY_INDEXED_HISTORY_VERIFIED',
  'ALCHEMY_TOKEN_BALANCES_VERIFIED',
  'RPC_PLAN_VERIFIED',
  'STAGING_ACCESS_TOKEN',
  'RESEND_API_KEY',
  'STAGING_INGRESS_DIAGNOSTIC_KEY',
  'STAGING_INGRESS_DIAGNOSTIC_UNTIL',
];
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
