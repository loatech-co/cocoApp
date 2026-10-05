#!/usr/bin/env node
/**
 * API latency benchmark: p50 / p95 / p99 / mean of the endpoints the 7.9
 * budget covers, against the throwaway `coco_bench` database.
 *
 *   bash scripts/perf/bench-db.sh create --long
 *   npm run build --workspace api
 *   node scripts/perf/api-bench.mjs            # 20 warmup + 200 timed per endpoint
 *   node scripts/perf/api-bench.mjs --runs 500 --only dashboard
 *   bash scripts/perf/bench-db.sh drop
 *
 * The API boots in-process from `api/dist` the way the e2e helper does it:
 * Nest testing module, `configureApp`, the throttler store that never blocks,
 * and Supabase Auth replaced by a stub that accepts one fixed token. Nothing
 * leaves the machine. It refuses to start unless the database is local and its
 * name starts with `coco_bench`, and it prints timings only: no amounts, no
 * names, no rows.
 */
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    runs: { type: 'string', default: '200' },
    warmup: { type: 'string', default: '20' },
    only: { type: 'string' },
    json: { type: 'boolean', default: false },
  },
});

const DB_URL =
  process.env.COCO_BENCH_DATABASE_URL ??
  `postgresql://${userInfo().username}@localhost:5432/coco_bench`;

const parsed = new URL(DB_URL);
const dbName = parsed.pathname.replace(/^\//, '');
if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || !dbName.startsWith('coco_bench')) {
  console.error(`api-bench: only a local coco_bench* database, not ${parsed.hostname}/${dbName}`);
  process.exit(1);
}

// Before anything from the API is loaded: Prisma and ConfigModule both read
// process.env first and neither overwrites what is already there.
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: DB_URL,
  DIRECT_URL: DB_URL,
  LOG_LEVEL: 'silent',
  JWT_SECRET: 'bench-only-secret-never-used-anywhere-else',
  CHECK_BREACHED_PASSWORDS: 'false',
  CORS_ORIGINS: 'http://localhost:5173',
  SOPORTES_DIR: mkdtempSync(join(tmpdir(), 'coco-bench-soportes-')),
  SOPORTES_STORAGE: 'disk',
});

const api = resolve(import.meta.dirname, '../../api');
const req = createRequire(join(api, 'package.json'));
const fromDist = (path) => req(join(api, 'dist', path));

const { Test } = req('@nestjs/testing');
const { ConfigService } = req('@nestjs/config');
const { ThrottlerStorage } = req('@nestjs/throttler');
const { AppModule } = fromDist('app.module.js');
const { configureApp } = fromDist('bootstrap.js');
const { installBigIntSerializer } = fromDist('common/serialization/bigint.js');
const { SupabaseAuthService } = fromDist('modules/auth/supabase-auth.service.js');
const { PrismaService } = fromDist('prisma/prisma.service.js');

const TOKEN = 'bench.token';
let benchAuthId = '';

installBigIntSerializer();
const builder = Test.createTestingModule({ imports: [AppModule] });
builder.overrideProvider(SupabaseAuthService).useValue({
  verificarAccessToken: (token) =>
    token === TOKEN
      ? Promise.resolve({ authId: benchAuthId, email: 'bench@local', iatMs: Date.now() })
      : Promise.reject(new Error('bench: unknown token')),
});
builder.overrideProvider(ThrottlerStorage).useValue({
  increment: () =>
    Promise.resolve({ totalHits: 0, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
});

const app = (await builder.compile()).createNestApplication({ logger: false });
configureApp(app, app.get(ConfigService));
await app.init();
await app.listen(0, '127.0.0.1');
const base = `http://127.0.0.1:${app.getHttpServer().address().port}/api/v1`;

const prisma = app.get(PrismaService);
const [{ current_database: connected }] =
  await prisma.$queryRaw`SELECT current_database()::text AS current_database`;
if (!connected.startsWith('coco_bench')) throw new Error(`connected to ${connected}`);

// The user with the most movements: that is the realistic one.
const [top] = await prisma.transaction.groupBy({
  by: ['userId'],
  _count: { _all: true },
  orderBy: { _count: { userId: 'desc' } },
  take: 1,
});
const user = await prisma.user.findUniqueOrThrow({ where: { id: top.userId } });
benchAuthId = user.authId;
const rows = top._count._all;

let sequence = 0;
const sms = () => {
  sequence += 1;
  return {
    texto:
      'Bancolombia le informa compra por $45.000 en KOBA COLOMBIA el 03/10/2026 con tu tarjeta *1234',
    source: 'sms',
    external_ref: `bench-sms-${process.pid}-${sequence}`,
  };
};
const manual = () => {
  sequence += 1;
  return {
    comercio: 'Bench',
    monto: '1000',
    fecha: new Date().toISOString().slice(0, 10),
    source: 'web',
    external_ref: `bench-manual-${process.pid}-${sequence}`,
  };
};

// Reads first: the captures write rows and must not shift the reads.
const ENDPOINTS = [
  { name: 'GET /dashboard (current month)', path: '/dashboard' },
  {
    name: 'GET /dashboard (2000-01-01..2026-12-31)',
    path: '/dashboard?from=2000-01-01&to=2026-12-31',
  },
  {
    name: 'GET /transactions (page 1, 25, -date)',
    path: '/transactions?page=1&per_page=25&sort=-date',
  },
  { name: 'GET /transactions (per_page=200)', path: '/transactions?per_page=200' },
  { name: 'POST /transactions/capture (manual)', path: '/transactions/capture', body: manual },
  { name: 'POST /transactions/capture (SMS)', path: '/transactions/capture', body: sms },
].filter((e) => !args.only || e.name.includes(args.only));

async function call(endpoint) {
  const init = endpoint.body
    ? {
        method: 'POST',
        headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify(endpoint.body()),
      }
    : { headers: { authorization: `Bearer ${TOKEN}` } };
  const started = performance.now();
  const response = await fetch(base + endpoint.path, init);
  await response.arrayBuffer();
  const elapsed = performance.now() - started;
  if (!response.ok) throw new Error(`${endpoint.name}: HTTP ${response.status}`);
  return elapsed;
}

const percentile = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

const results = [];
for (const endpoint of ENDPOINTS) {
  for (let i = 0; i < Number(args.warmup); i += 1) await call(endpoint);
  const times = [];
  for (let i = 0; i < Number(args.runs); i += 1) times.push(await call(endpoint));
  times.sort((a, b) => a - b);
  results.push({
    endpoint: endpoint.name,
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    p99: percentile(times, 99),
    mean: times.reduce((a, b) => a + b, 0) / times.length,
  });
}

// The captures wrote rows: take them back out so the next run starts equal.
await prisma.transaction.deleteMany({
  where: { userId: user.id, externalRef: { startsWith: `bench-` } },
});

await app.close();

if (args.json) {
  console.log(JSON.stringify({ database: connected, rows, runs: Number(args.runs), results }));
} else {
  const ms = (v) => v.toFixed(1);
  console.log(`database ${connected}, ${rows} transactions, ${args.runs} runs per endpoint\n`);
  console.log('| Endpoint | p50 | p95 | p99 | mean |');
  console.log('| --- | --- | --- | --- | --- |');
  for (const r of results) {
    console.log(`| ${r.endpoint} | ${ms(r.p50)} | ${ms(r.p95)} | ${ms(r.p99)} | ${ms(r.mean)} |`);
  }
}
