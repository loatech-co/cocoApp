// Pulls everything a full backup needs out of production, READ-ONLY, into a
// local staging folder that backup.sh then encrypts (step R-1c).
//
//   <out>/db.dump        pg_dump custom format of the `public`, `auth` and
//                        `app_private` schemas (the last holds the helpers the
//                        row-level security policies call, ADR 0024)
//   <out>/conteos.tsv    "schema.table<TAB>rows" for every table in both schemas
//   <out>/soportes/…     every object of the private `soportes` bucket
//   <out>/sumas.sha256   sha256 of every downloaded object (shasum -c format)
//   <out>/manifest.json  versions, totals and timings; no secrets, no amounts
//
// The names inside the archive stay as they were (`conteos.tsv`,
// `sumas.sha256`, and `soportes/`, named after the bucket): they are a stored
// format, and restore.sh has to open every backup already on disk. Nothing
// reads the manifest but people, so its keys went to English (format 2).
//
// ONE snapshot for all of it. A read-only REPEATABLE READ transaction exports
// its snapshot; the row counts, the list of bucket objects, the `soportes`
// rows and pg_dump itself (--snapshot) all read that same instant. Counting in
// a separate session would race the app: every token refresh writes to
// auth.refresh_tokens, and the counts would never match the dump.
//
// Why `postgres` through DIRECT_URL can read `auth`: Supabase grants it SELECT
// on every auth table (checked on 2026-10-05: 27 of 27). Nothing here writes;
// the transaction is READ ONLY, so a mistake fails instead of writing.
//
// The bucket: downloaded with the service key (GET only). Every object with a
// row in `soportes` must hash to `soportes.huella`; a row without its object,
// or a hash that differs, fails the backup. Objects without a row are kept and
// reported (orphans): a backup takes everything and judges nothing.
//
// Usage (run by backup.sh):
//   npx dotenv -e api/.env.supabase -- node scripts/backup/extract.mjs --out <dir>

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import pg from 'pg';

const args = process.argv.slice(2);
const out = args[args.indexOf('--out') + 1];
if (!args.includes('--out') || !out) {
  console.error('Usage: extract.mjs --out <dir>');
  process.exit(1);
}

const clean = (value) => value?.replace(/^['"]|['"]$/g, '');
const supabaseUrl = clean(process.env.SUPABASE_URL)?.replace(/\/$/, '');
const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
const databaseUrl = clean(process.env.DIRECT_URL);
// RECEIPTS_BUCKET; SOPORTES_BUCKET is its old name, read until step 7.10.
const bucket = process.env.RECEIPTS_BUCKET ?? process.env.SOPORTES_BUCKET ?? 'soportes';
if (!supabaseUrl || !serviceKey || !databaseUrl) {
  console.error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or DIRECT_URL is missing.');
  process.exit(1);
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const started = Date.now();
const seconds = (from) => Math.round((Date.now() - from) / 100) / 10;

/** Runs pg_dump against the exported snapshot; rejects on a non-zero exit. */
function dump(snapshot, file) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'pg_dump',
      [
        databaseUrl,
        `--snapshot=${snapshot}`,
        '--format=custom',
        '--schema=public',
        '--schema=auth',
        '--schema=app_private',
        '--no-owner',
        '--no-privileges',
        `--file=${file}`,
      ],
      { stdio: ['ignore', 'inherit', 'inherit'] },
    );
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`pg_dump exited with ${code}`)),
    );
  });
}

/** A storage name becomes a path under soportes/; nothing may climb out. */
function safePath(name) {
  if (name.startsWith('/') || name.split('/').includes('..'))
    throw new Error(`invalid object name in the bucket: ${name}`);
  return name;
}

async function download(name) {
  const url = `${supabaseUrl}/storage/v1/object/${bucket}/${name
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      lastError = new Error(`HTTP ${response.status}`);
      if (response.status === 404) break;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

await mkdir(join(out, 'soportes'), { recursive: true, mode: 0o700 });

// ── 1. The snapshot, the counts and the lists ────────────────────────────────
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
const {
  rows: [{ snapshot, server_version: serverVersion }],
} = await client.query(
  'SELECT pg_export_snapshot() AS snapshot, current_setting($1) AS server_version',
  ['server_version'],
);

const { rows: tables } = await client.query(`
  SELECT n.nspname AS schema, c.relname AS name
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'auth') AND c.relkind IN ('r', 'p') AND NOT c.relispartition
  ORDER BY 1, 2`);
const counts = [];
for (const table of tables) {
  const { rows } = await client.query(
    `SELECT count(*)::bigint AS n FROM ${client.escapeIdentifier(table.schema)}.${client.escapeIdentifier(table.name)}`,
  );
  counts.push([`${table.schema}.${table.name}`, rows[0].n]);
}

const { rows: objects } = await client.query(
  'SELECT name FROM storage.objects WHERE bucket_id = $1 ORDER BY name',
  [bucket],
);
const { rows: receipts } = await client.query(
  'SELECT storage_key, huella FROM soportes ORDER BY storage_key',
);

// ── 2. pg_dump, inside the same snapshot ─────────────────────────────────────
const dumpStarted = Date.now();
try {
  await dump(snapshot, join(out, 'db.dump'));
} finally {
  await client.query('COMMIT');
  await client.end();
}
const dumpSeconds = seconds(dumpStarted);
await writeFile(join(out, 'conteos.tsv'), counts.map((row) => row.join('\t')).join('\n') + '\n');
console.log(
  `   database: ${tables.length} tables, ${counts.reduce((sum, [, n]) => sum + Number(n), 0)} rows (${dumpSeconds} s)`,
);

// ── 3. The bucket ────────────────────────────────────────────────────────────
const bucketStarted = Date.now();
const hashByKey = new Map(receipts.map((row) => [row.storage_key, row.huella]));
const objectNames = new Set(objects.map((row) => row.name));
const missing = receipts.filter((row) => !objectNames.has(row.storage_key));
const sums = [];
const failed = [];
let bytes = 0;

async function fetchOne(name) {
  try {
    const content = await download(name);
    const hash = sha256(content);
    const expected = hashByKey.get(name);
    if (expected && expected !== hash) {
      failed.push(`${name}: the hash does not match`);
      return;
    }
    const path = join(out, 'soportes', safePath(name));
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, content, { mode: 0o600 });
    sums.push(`${hash}  soportes/${name}`);
    bytes += content.length;
  } catch (error) {
    failed.push(`${name}: ${error.message}`);
  }
}

const names = [...objectNames];
for (let index = 0; index < names.length; index += 4) {
  await Promise.all(names.slice(index, index + 4).map(fetchOne));
  if (process.stdout.isTTY)
    process.stdout.write(`   bucket: ${Math.min(index + 4, names.length)}/${names.length}\r`);
}
sums.sort();
await writeFile(join(out, 'sumas.sha256'), sums.join('\n') + (sums.length ? '\n' : ''));
const orphans = names.filter((name) => !hashByKey.has(name)).length;
console.log(
  `   bucket: ${sums.length} objects, ${Math.round(bytes / 1024 / 1024)} MB, ` +
    `${receipts.length - missing.length} checked against soportes.huella, ` +
    `${orphans} without a row (${seconds(bucketStarted)} s)`,
);

const manifest = {
  format: 2,
  created: new Date(started).toISOString(),
  source: new URL(supabaseUrl).host,
  postgres: serverVersion,
  schemas: ['public', 'auth', 'app_private'],
  tables: tables.length,
  rows: counts.reduce((sum, [, n]) => sum + Number(n), 0),
  bucket: { name: bucket, objects: sums.length, bytes, withoutRow: orphans },
  receipts: { rows: receipts.length, withoutObject: missing.length },
  seconds: { dump: dumpSeconds, bucket: seconds(bucketStarted), total: seconds(started) },
};
await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

if (missing.length > 0 || failed.length > 0) {
  for (const row of missing) console.error(`   no object in the bucket: ${row.storage_key}`);
  for (const line of failed) console.error(`   failed: ${line}`);
  console.error('The backup is INCOMPLETE: it cannot be used.');
  process.exit(1);
}
