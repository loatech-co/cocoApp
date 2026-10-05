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
 * Exits with 1 when an endpoint's p95 is over the budget (`--budget-ms`,
 * 50 ms by default: see CONTRIBUTING.md, "Performance budgets"). It prints
 * timings only: no amounts, no names, no rows.
 */
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';

import { startBenchApi } from './bench-api.mjs';

const { values: args } = parseArgs({
  options: {
    runs: { type: 'string', default: '200' },
    warmup: { type: 'string', default: '20' },
    only: { type: 'string' },
    'budget-ms': { type: 'string', default: '50' },
    json: { type: 'boolean', default: false },
  },
});

const api = await startBenchApi();
const budget = Number(args['budget-ms']);

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
  const authorization = `Bearer ${api.accessToken}`;
  const init = endpoint.body
    ? {
        method: 'POST',
        headers: { authorization, 'content-type': 'application/json' },
        body: JSON.stringify(endpoint.body()),
      }
    : { headers: { authorization } };
  const started = performance.now();
  const response = await fetch(api.base + endpoint.path, init);
  await response.arrayBuffer();
  const elapsed = performance.now() - started;
  if (!response.ok) throw new Error(`${endpoint.name}: HTTP ${response.status}`);
  return elapsed;
}

const percentile = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

const results = [];
try {
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
} finally {
  // The captures wrote rows: take them back out so the next run starts equal.
  await api.prisma.transaction.deleteMany({
    where: { userId: api.userId, externalRef: { startsWith: 'bench-' } },
  });
  await api.close();
}

const over = results.filter((r) => r.p95 > budget);

if (args.json) {
  console.log(
    JSON.stringify({ database: api.database, rows: api.rows, runs: Number(args.runs), results }),
  );
} else {
  const ms = (v) => v.toFixed(1);
  console.log(`database ${api.database}, ${api.rows} transactions, ${args.runs} runs each\n`);
  console.log('| Endpoint (ms) | p50 | p95 | p99 | mean |');
  console.log('| --- | --- | --- | --- | --- |');
  for (const r of results) {
    console.log(`| ${r.endpoint} | ${ms(r.p50)} | ${ms(r.p95)} | ${ms(r.p99)} | ${ms(r.mean)} |`);
  }
  console.log(`\nbudget: p95 <= ${budget} ms — ${over.length === 0 ? 'ok' : 'OVER'}`);
}
process.exit(over.length === 0 ? 0 : 1);
