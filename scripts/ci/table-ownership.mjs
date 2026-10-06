// Fails when an API repository touches a table its module does not own
// (step 7.4, CONTRIBUTING.md "Architecture"). dependency-cruiser sees imports,
// not queries; this sees `prisma.<model>` / `tx.<model>` in repositories.
// Run: node scripts/ci/table-ownership.mjs (part of `npm run depcruise`).
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const SRC = join(ROOT, 'api', 'src');

/** Prisma model → the folder under api/src that owns its table. */
const OWNER = {
  user: 'modules/auth',
  auditLog: 'common/audit',
  account: 'modules/accounts',
  category: 'modules/categories',
  categoryRule: 'modules/categorization',
  tag: 'modules/tags',
  transaction: 'modules/transactions',
  transactionSplit: 'modules/transactions',
  transactionTag: 'modules/transactions',
  receipt: 'modules/receipts',
  userPreference: 'modules/preferences',
  importBatch: 'modules/categories',
  importRow: 'modules/categories',
};

/**
 * TEMPORARY: the cross-module table accesses left after step 7.4. Each one is
 * a pair of modules that already depend on each other the other way, so going
 * through the owner's service would make a module cycle; or a unit of work
 * that has to stay in one database transaction. Removing them is a design
 * decision (a ledger read model, passing a transaction client between
 * modules), not a refactor. Never add to this list.
 */
const KNOWN = {
  // Balances are sums of movements; transactions checks account ownership.
  'modules/accounts/accounts.repository.ts': ['transaction'],
  // Deleting or merging a category moves its movements, splits, rules and
  // import rows inside ONE $transaction.
  'modules/categories/categories.repository.ts': [
    'transaction',
    'transactionSplit',
    'categoryRule',
  ],
  // Receipts hang from movements; transactions deletes their files.
  'modules/receipts/receipts.repository.ts': ['transaction'],
  // Ownership checks of the account and category a movement points at, and
  // the category branch a filter expands to.
  'modules/transactions/transactions.repository.ts': ['account', 'category'],
};

function* repositories(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* repositories(path);
    else if (entry.name.endsWith('.repository.ts')) yield path;
  }
}

const problems = [];
for (const file of repositories(SRC)) {
  const rel = relative(SRC, file);
  const folder = rel.split('/').slice(0, 2).join('/');
  const allowed = new Set(KNOWN[rel] ?? []);
  const models = new Set(
    [...readFileSync(file, 'utf8').matchAll(/\b(?:prisma|tx)\.([a-z][A-Za-z]*)\./g)].map(
      (match) => match[1],
    ),
  );
  for (const model of models) {
    const owner = OWNER[model];
    if (owner === undefined) problems.push(`${rel}: model "${model}" has no owner in OWNER`);
    else if (owner !== folder && !allowed.has(model)) {
      problems.push(`${rel}: "${model}" belongs to ${owner} — go through its service`);
    }
  }
}

if (problems.length > 0) {
  console.error(`Table ownership: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('Table ownership: every repository touches only its own tables.');
