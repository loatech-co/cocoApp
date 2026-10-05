// Fails on any high or critical vulnerability in production dependencies,
// except the advisories listed below — each with its reason and when to drop it.
// Run: node scripts/ci/audit.mjs
import { execFileSync } from 'node:child_process';

/** Advisory URL → why it is accepted for now. Remove an entry the day its reason stops being true. */
const ACCEPTED = {
  'https://github.com/advisories/GHSA-ggr8-5vv4-36mx':
    'deepmerge-ts < 8 inside the Prisma CLI (@prisma/config pins 7.1.5). Build-time config merge, ' +
    'never on a request path. Every stable Prisma (6.x and 7.x) is in the affected range; drop when ' +
    'a stable Prisma ships deepmerge-ts 8 (checked 2026-10-05: only 8.1 pre-releases).',
};

let report;
try {
  report = execFileSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
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
    if (!ACCEPTED[advisory.url]) blocking.push(`${name} (${advisory.severity}): ${advisory.title} ${advisory.url}`);
  }
}

if (blocking.length > 0) {
  console.error(`npm audit: ${blocking.length} high/critical advisory(ies) not accepted:\n  ${blocking.join('\n  ')}`);
  process.exit(1);
}
console.log(`npm audit: no unaccepted high/critical advisories (${Object.keys(ACCEPTED).length} accepted with reason)`);
