// Fails on any high or critical vulnerability in production dependencies,
// except the advisories listed below — each with its reason and when to drop it.
// Run: node scripts/ci/audit.mjs
import { execFileSync } from 'node:child_process';

/** Advisory URL → why it is accepted for now. Remove an entry the day its reason stops being true. */
const ACCEPTED = {
  'https://github.com/advisories/GHSA-ggr8-5vv4-36mx':
    'deepmerge-ts < 8 inside the Prisma CLI (@prisma/config 7.10.0 still pins 7.1.5). Build-time ' +
    'config merge, never on a request path. Every stable Prisma (6.x and 7.x) is in the affected ' +
    'range; drop when a stable Prisma ships deepmerge-ts 8 (checked 2026-10-05 on prisma 7.10.0: ' +
    'only 8.x pre-releases do).',
  // Prisma 7's CLI pins mysql2 3.15.3 for Studio and `prisma dev` against MySQL. The API never
  // loads it: Coco is Postgres through @prisma/adapter-pg. A root `overrides` entry did not take
  // (npm 11.9 kept 3.15.3), so it is accepted until Prisma bumps the pin.
  'https://github.com/advisories/GHSA-3f6p-5ww8-9rcr':
    'mysql2 < 3.22 pinned by the Prisma 7 CLI (prisma 7.10.0 → mysql2 3.15.3). Only used to talk ' +
    'to MySQL from the CLI; Coco is Postgres and the API never imports it. Drop when a stable ' +
    'Prisma pins mysql2 >= 3.24 (checked 2026-10-05).',
  'https://github.com/advisories/GHSA-rgwj-5xj2-c3m3':
    'mysql2 <= 3.23 pinned by the Prisma 7 CLI, same path and same exit as GHSA-3f6p-5ww8-9rcr ' +
    '(checked 2026-10-05).',
};

let report;
try {
  report = execFileSync('npm', ['audit', '--omit=dev', '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (error) {
  // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
  report = error.stdout;
}

const { vulnerabilities = {} } = JSON.parse(report);
const blocking = [];
for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
  if (!['high', 'critical'].includes(vulnerability.severity)) continue;
  const advisories = vulnerability.via.filter((via) => typeof via === 'object');
  // A package flagged only through another package inherits that package's verdict.
  if (advisories.length === 0) continue;
  for (const advisory of advisories) {
    if (!ACCEPTED[advisory.url])
      blocking.push(`${name} (${advisory.severity}): ${advisory.title} ${advisory.url}`);
  }
}

if (blocking.length > 0) {
  console.error(
    `npm audit: ${blocking.length} high/critical advisory(ies) not accepted:\n  ${blocking.join('\n  ')}`,
  );
  process.exit(1);
}
console.log(
  `npm audit: no unaccepted high/critical advisories (${Object.keys(ACCEPTED).length} accepted with reason)`,
);
