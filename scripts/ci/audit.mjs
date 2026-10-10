// Two thresholds, one per tree, with the advisories listed below accepted in both — each with its
// reason and when to drop it:
// - production dependencies (what the server installs): any high or critical fails;
// - the whole tree, development included (what Hostinger's scanner reads): a critical fails, a
//   high is listed as a warning.
// Run: node scripts/ci/audit.mjs
import { execFileSync } from 'node:child_process';

/** Advisory URL → why it is accepted for now. Remove an entry the day its reason stops being true. */
const ACCEPTED = {
  'https://github.com/advisories/GHSA-ggr8-5vv4-36mx':
    'deepmerge-ts < 8 inside the Prisma CLI (@prisma/config 7.10.0 still pins 7.1.5). Build-time ' +
    'config merge, never on a request path. Every stable Prisma (6.x and 7.x) is in the affected ' +
    'range; drop when a stable Prisma ships deepmerge-ts 8 (checked 2026-10-06 on prisma 7.10.0: ' +
    'only 8.x pre-releases do).',
  // Prisma 7's CLI pins mysql2 3.15.3 for Studio and `prisma dev` against MySQL. The API never
  // loads it: Coco is Postgres through @prisma/adapter-pg. A root `overrides` entry did not take
  // (npm 11.9 kept 3.15.3), so it is accepted until Prisma bumps the pin.
  'https://github.com/advisories/GHSA-3f6p-5ww8-9rcr':
    'mysql2 < 3.22 pinned by the Prisma 7 CLI (prisma 7.10.0 → mysql2 3.15.3). Only used to talk ' +
    'to MySQL from the CLI; Coco is Postgres and the API never imports it. Drop when a stable ' +
    'Prisma pins mysql2 >= 3.24 (checked 2026-10-06 on prisma 7.10.0).',
  'https://github.com/advisories/GHSA-rgwj-5xj2-c3m3':
    'mysql2 <= 3.23 pinned by the Prisma 7 CLI, same path and same exit as GHSA-3f6p-5ww8-9rcr ' +
    '(checked 2026-10-06).',
};

// Known false positive, NOT an entry above because npm audit no longer reports it:
// esbuild 0.25.12 (vite, storybook, tsx — all dev) is flagged by scanners that still carry
// GHSA-gv7w-rqvm-qjhr ("missing binary integrity verification in Deno module", >= 0.17.0
// < 0.28.1). GitHub WITHDREW it on 2026-06-17: https://github.com/advisories/GHSA-gv7w-rqvm-qjhr
// Hostinger's scanner still mails about it. Do not bump esbuild for it: the tree must keep ONE
// esbuild (scripts/verify-clean-install.sh) and vite 6 pins 0.25 (checked 2026-10-06).

/** Unaccepted advisories at the given severities, as printable lines. */
function audit(args, severities) {
  let report;
  try {
    report = execFileSync('npm', ['audit', ...args, '--json'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
    report = error.stdout;
  }
  const { vulnerabilities = {} } = JSON.parse(report);
  const found = [];
  for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
    // A package flagged only through another package inherits that package's verdict.
    for (const advisory of vulnerability.via.filter((via) => typeof via === 'object')) {
      if (severities.includes(advisory.severity) && !ACCEPTED[advisory.url])
        found.push(`${name} (${advisory.severity}): ${advisory.title} ${advisory.url}`);
    }
  }
  return found;
}

const production = audit(['--omit=dev'], ['high', 'critical']);
const critical = audit([], ['critical']);
const high = audit([], ['high']);

if (high.length > 0) {
  console.warn(
    `npm audit (whole tree): ${high.length} high advisory(ies), warning only:\n  ${high.join('\n  ')}`,
  );
}
if (production.length > 0) {
  console.error(
    `npm audit (production): ${production.length} high/critical advisory(ies) not accepted:\n  ${production.join('\n  ')}`,
  );
}
if (critical.length > 0) {
  console.error(
    `npm audit (whole tree): ${critical.length} critical advisory(ies) not accepted:\n  ${critical.join('\n  ')}`,
  );
}
if (production.length > 0 || critical.length > 0) process.exit(1);
console.log(
  `npm audit: no unaccepted high/critical in production nor critical in the whole tree (${Object.keys(ACCEPTED).length} accepted with reason)`,
);
