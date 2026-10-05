// Copies every receipt file into the Supabase Storage bucket and proves each
// copy is identical, by hash (phase 6.9). Idempotent: run it again and it
// only verifies what is already there.
//
// Reads the files from a LOCAL folder —the backup brought down with
// backup-from-server.sh— so the server takes no load beyond that one rsync.
// The rows come from the database of the same env file as the bucket.
//
// For every row in `soportes`:
//   1. the local file exists and its sha256 equals `soportes.huella`;
//   2. if the bucket already has it, download it and compare the hash;
//      otherwise upload it with its mime type, then download and compare.
// It also counts ORPHANS: local files that no row references. They are
// reported, never deleted.
//
// Usage:
//   npx dotenv -e api/.env.supabase -- node scripts/soportes/copy-to-storage.mjs --from "$COCO_DATA_DIR/respaldos/soportes-…" [--dry-run]
//
// Exit code 0 only when every row ends verified in the bucket (or, with
// --dry-run, verified locally).

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

import pg from 'pg';

const args = process.argv.slice(2);
const fromIndex = args.indexOf('--from');
const from = fromIndex >= 0 ? args[fromIndex + 1] : undefined;
const dryRun = args.includes('--dry-run');
if (!from) {
  console.error('Usage: copy-to-storage.mjs --from <local folder> [--dry-run]');
  process.exit(1);
}

const clean = (value) => value?.replace(/^['"]|['"]$/g, '');
const url = clean(process.env.SUPABASE_URL)?.replace(/\/$/, '');
const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
const bucket = process.env.SOPORTES_BUCKET ?? 'soportes';
const databaseUrl = clean(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
if (!url || !key || !databaseUrl) {
  console.error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL are required.');
  process.exit(1);
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const auth = { authorization: `Bearer ${key}`, apikey: key };
const objectUrl = (storageKey) =>
  `${url}/storage/v1/object/${bucket}/${storageKey.split('/').map(encodeURIComponent).join('/')}`;

async function download(storageKey) {
  const response = await fetch(objectUrl(storageKey), {
    headers: auth,
    signal: AbortSignal.timeout(60_000),
  });
  return response.ok ? Buffer.from(await response.arrayBuffer()) : null;
}

async function upload(storageKey, content, mimeType) {
  const response = await fetch(objectUrl(storageKey), {
    method: 'POST',
    headers: { ...auth, 'content-type': mimeType, 'x-upsert': 'false' },
    body: content,
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${await response.text()}`);
}

async function listFiles(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)));
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
const { rows } = await client.query(
  'SELECT id, storage_key, huella, mime_type FROM soportes ORDER BY id',
);
await client.end();

const tally = {
  rows: rows.length,
  uploaded: 0,
  alreadyThere: 0,
  missingLocal: [],
  badLocalHash: [],
  failed: [],
};

/** Handles one row; never throws, records the outcome in `tally`. */
async function copyOne(row) {
  let content;
  try {
    content = await readFile(join(from, row.storage_key));
  } catch {
    tally.missingLocal.push(row.storage_key);
    return;
  }
  if (sha256(content) !== row.huella) {
    tally.badLocalHash.push(row.storage_key);
    return;
  }
  if (dryRun) return;

  try {
    let remote = await download(row.storage_key);
    if (remote) {
      tally.alreadyThere += 1;
    } else {
      await upload(row.storage_key, content, row.mime_type);
      remote = await download(row.storage_key);
      tally.uploaded += 1;
    }
    if (!remote || sha256(remote) !== row.huella)
      tally.failed.push(`${row.storage_key}: hash differs in the bucket`);
  } catch (error) {
    tally.failed.push(`${row.storage_key}: ${error.message}`);
  }
}

// Four at a time: fast enough for a few hundred files, gentle on the API.
for (let index = 0; index < rows.length; index += 4) {
  await Promise.all(rows.slice(index, index + 4).map(copyOne));
  if ((index / 4) % 25 === 0)
    process.stdout.write(`  ${Math.min(index + 4, rows.length)}/${rows.length}\r`);
}

const referenced = new Set(rows.map((row) => row.storage_key));
const localFiles = await listFiles(from);
const orphans = localFiles.filter((file) => !referenced.has(file));

console.log(`\nproject ${new URL(url).host} · bucket "${bucket}"${dryRun ? ' · DRY RUN' : ''}`);
console.log(`rows ${tally.rows} · local files ${localFiles.length}`);
console.log(
  `uploaded ${tally.uploaded} · already in bucket ${tally.alreadyThere} · verified ${tally.uploaded + tally.alreadyThere - tally.failed.length}`,
);
console.log(
  `missing locally ${tally.missingLocal.length} · local hash mismatch ${tally.badLocalHash.length} · failed ${tally.failed.length}`,
);
console.log(`orphans on disk (no row; NOT deleted): ${orphans.length}`);
for (const line of [
  ...tally.missingLocal.map((k) => `missing: ${k}`),
  ...tally.badLocalHash.map((k) => `bad hash: ${k}`),
  ...tally.failed,
]) {
  console.log(`  ${line}`);
}
if (orphans.length > 0)
  console.log(`  orphans: ${orphans.slice(0, 20).join(', ')}${orphans.length > 20 ? ' …' : ''}`);

const ok =
  tally.missingLocal.length === 0 &&
  tally.badLocalHash.length === 0 &&
  tally.failed.length === 0 &&
  (dryRun || tally.uploaded + tally.alreadyThere === tally.rows);
process.exit(ok ? 0 : 1);
