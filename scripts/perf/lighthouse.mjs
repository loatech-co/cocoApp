#!/usr/bin/env node
/**
 * Lighthouse, mobile, performance only: login, dashboard and the transaction
 * sheet (step 7.9, D27). Median of 5 runs per page; exits with 1 when a
 * median is under the budget (`--budget`, 90 by default).
 *
 *   bash scripts/perf/bench-db.sh create --long
 *   npm run build --workspace api && npm run build --workspace frontend
 *   node scripts/perf/lighthouse.mjs [--runs 5] [--budget 90]
 *
 * Not a CI gate: shared runners vary too much for a score to block a PR
 * (D27). It runs by hand, or through the `perf` workflow (workflow_dispatch).
 *
 * The API boots in-process against `coco_bench` (bench-api.mjs) and `vite
 * preview` serves the production build of the SPA, proxying `/api` to it. The
 * session is the refresh cookie the bench auth stub accepts, so nothing
 * reaches Supabase.
 *
 * Lighthouse and puppeteer-core are NOT dependencies of the repo: they weigh
 * far more than everything else in `npm ci`, and only this script uses them.
 * The first run installs the pinned versions below into
 * `node_modules/.cache/coco-perf`. Chrome is the one installed on the machine
 * (or CHROME_PATH).
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { startBenchApi } from './bench-api.mjs';

const LIGHTHOUSE = '13.5.0';
const PUPPETEER = '25.12.0';

const { values: args } = parseArgs({
  options: {
    runs: { type: 'string', default: '5' },
    budget: { type: 'string', default: '90' },
    json: { type: 'boolean', default: false },
  },
});

const repo = resolve(import.meta.dirname, '../..');
const tools = join(repo, 'node_modules', '.cache', 'coco-perf');
if (!existsSync(join(tools, 'node_modules', 'lighthouse', 'package.json'))) {
  console.error(`installing lighthouse@${LIGHTHOUSE} and puppeteer-core@${PUPPETEER} in ${tools}`);
  execFileSync(
    'npm',
    [
      'install',
      '--prefix',
      tools,
      '--no-save',
      '--no-audit',
      '--no-fund',
      `lighthouse@${LIGHTHOUSE}`,
      `puppeteer-core@${PUPPETEER}`,
    ],
    { stdio: 'inherit' },
  );
}
const fromTools = createRequire(join(tools, 'package.json'));
const load = (name) => import(pathToFileURL(fromTools.resolve(name)).href);

const { startFlow } = await load('lighthouse');
const puppeteer = (await load('puppeteer-core')).default;
const { Launcher } = await load('chrome-launcher');

const chromePath = process.env.CHROME_PATH ?? Launcher.getInstallations()[0];
if (!chromePath) throw new Error('lighthouse: no Chrome found; set CHROME_PATH');

const api = await startBenchApi();
// The frontend's own Vite, the one that built `frontend/dist`.
const fromFrontend = createRequire(join(repo, 'frontend', 'package.json'));
const { preview } = await import(pathToFileURL(fromFrontend.resolve('vite')).href);
const server = await preview({
  root: join(repo, 'frontend'),
  logLevel: 'silent',
  preview: { host: '127.0.0.1', port: 0, strictPort: false, proxy: { '/api': api.origin } },
});
const origin = server.resolvedUrls.local[0].replace(/\/$/, '');

/** One run of the three pages, each in a fresh browser: no warm cache between them. */
async function oneRun() {
  const scores = {};

  const measure = async (name, steps) => {
    const browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      args: ['--no-sandbox'],
    });
    try {
      const page = await browser.newPage();
      const flow = await startFlow(page, {
        name,
        config: { extends: 'lighthouse:default', settings: { onlyCategories: ['performance'] } },
      });
      await steps(page, flow);
      const result = await flow.createFlowResult();
      const lhr = result.steps.at(-1).lhr;
      scores[name] = {
        score: Math.round((lhr.categories.performance.score ?? 0) * 100),
        lcp: lhr.audits['largest-contentful-paint']?.numericValue,
        tbt: lhr.audits['total-blocking-time']?.numericValue,
        cls: lhr.audits['cumulative-layout-shift']?.numericValue,
        inp: lhr.audits['interaction-to-next-paint']?.numericValue,
        // What moved, for --json: the selector of each shifted node.
        shifts: (lhr.audits['layout-shifts']?.details?.items ?? []).map((item) => ({
          score: item.score,
          node: item.node?.selector,
        })),
      };
    } finally {
      await browser.close();
    }
  };

  const withSession = (page) =>
    page.browserContext().setCookie({
      name: 'coco_refresh',
      value: api.refreshToken,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Strict',
    });

  await measure('login', async (_page, flow) => {
    await flow.navigate(`${origin}/`);
  });

  await measure('dashboard', async (page, flow) => {
    await withSession(page);
    await flow.navigate(`${origin}/`);
  });

  // The sheet has no URL: it is a click on a row of the dashboard. That click
  // is measured as a timespan (TBT, INP, CLS of opening it), after a
  // navigation that is not part of its score.
  await measure('transaction sheet', async (page, flow) => {
    await withSession(page);
    await page.goto(`${origin}/`, { waitUntil: 'networkidle0' });
    const row = await page.waitForSelector('tbody tr', { timeout: 30_000 });
    await flow.startTimespan();
    await row.click();
    await page.waitForSelector('[role="dialog"]', { timeout: 30_000 });
    await new Promise((done) => setTimeout(done, 1000));
    await flow.endTimespan();
  });

  return scores;
}

const runs = [];
try {
  for (let i = 0; i < Number(args.runs); i += 1) runs.push(await oneRun());
} finally {
  await server.close();
  await api.close();
}

const median = (values) => {
  const sorted = values.filter((v) => typeof v === 'number').sort((a, b) => a - b);
  return sorted.length === 0 ? null : sorted[Math.floor(sorted.length / 2)];
};
const pages = Object.keys(runs[0]);
const summary = pages.map((page) => ({
  page,
  scores: runs.map((r) => r[page].score),
  median: median(runs.map((r) => r[page].score)),
  lcp: median(runs.map((r) => r[page].lcp)),
  tbt: median(runs.map((r) => r[page].tbt)),
  cls: median(runs.map((r) => r[page].cls)),
  inp: median(runs.map((r) => r[page].inp)),
  shifts: runs.at(-1)[page].shifts,
}));

const budget = Number(args.budget);
const under = summary.filter((s) => s.median < budget);

if (args.json) {
  console.log(JSON.stringify({ lighthouse: LIGHTHOUSE, budget, summary }));
} else {
  const ms = (v) => (v === null ? '—' : `${Math.round(v)} ms`);
  console.log(`lighthouse ${LIGHTHOUSE}, mobile, ${args.runs} runs, ${api.rows} transactions\n`);
  console.log('| Page | Scores | Median | LCP | TBT | CLS | INP |');
  console.log('| --- | --- | --- | --- | --- | --- | --- |');
  for (const s of summary) {
    const cls = s.cls === null ? '—' : s.cls.toFixed(3);
    console.log(
      `| ${s.page} | ${s.scores.join(' / ')} | **${s.median}** | ${ms(s.lcp)} | ${ms(s.tbt)} | ${cls} | ${ms(s.inp)} |`,
    );
  }
  console.log(`\nbudget: median >= ${budget} — ${under.length === 0 ? 'ok' : 'UNDER'}`);
}
process.exit(under.length === 0 ? 0 : 1);
