// Billable Actions minutes of this repository, from its own job timings (step J-7).
//
//   node scripts/ci/actions-minutes.mjs            this month
//   node scripts/ci/actions-minutes.mjs 2026-10-01 since that day
//
// The billing endpoints need the `user` scope (docs/runbook.md, "CI minutes");
// this needs only `gh` logged in with read access. It bills like GitHub: each
// job rounded UP to the minute, a macOS minute counted as ten. Re-runs count.
import { execFileSync } from 'node:child_process';

const REPO = 'loatech-co/cocoApp';
const since =
  process.argv[2] ??
  new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);

const gh = (path) =>
  JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 64 << 20 }));

const byWorkflow = new Map();
let total = 0;
for (let page = 1; ; page++) {
  const { workflow_runs: runs } = gh(
    `repos/${REPO}/actions/runs?created=>=${since}&per_page=100&page=${page}`,
  );
  if (runs.length === 0) break;
  for (const run of runs) {
    for (let attempt = 1; attempt <= run.run_attempt; attempt++) {
      const { jobs } = gh(
        `repos/${REPO}/actions/runs/${run.id}/attempts/${attempt}/jobs?per_page=100`,
      );
      for (const job of jobs) {
        if (!job.started_at || !job.completed_at || job.conclusion === 'skipped') continue;
        const seconds = (Date.parse(job.completed_at) - Date.parse(job.started_at)) / 1000;
        const factor = job.labels.some((label) => label.startsWith('macos')) ? 10 : 1;
        const minutes = Math.max(1, Math.ceil(seconds / 60)) * factor;
        const key = `${run.name}/${job.name}`;
        byWorkflow.set(key, (byWorkflow.get(key) ?? 0) + minutes);
        total += minutes;
      }
    }
  }
}

for (const [key, minutes] of [...byWorkflow].sort((a, b) => b[1] - a[1])) {
  console.log(`${String(minutes).padStart(6)}  ${key}`);
}
console.log(`${String(total).padStart(6)}  total since ${since} (of 2000 a month)`);
