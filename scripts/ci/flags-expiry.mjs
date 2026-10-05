// Feature flags must not outlive their rollout (step 7.8).
//
// Reads the registry in packages/flags and compares each flag's `removeBy`
// with today (UTC). Past it: a warning, in the log and as a GitHub annotation.
// More than GRACE_DAYS past it: CI fails until the flag is deleted or its date
// is moved with a reason in the PR.
//
// The registry is read from the built package (`npm install` builds it in
// postinstall), the same code the API runs.
//
// Usage: node scripts/ci/flags-expiry.mjs [YYYY-MM-DD]   (default: today)
import { checkRetirement, FLAGS, GRACE_DAYS } from '@coco/flags';

const today = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const annotate = process.env.GITHUB_ACTIONS === 'true';

const { warnings, failures } = checkRetirement(FLAGS, today);

for (const line of warnings) {
  console.warn(annotate ? `::warning title=Feature flag past removeBy::${line}` : `warn: ${line}`);
}
for (const line of failures) {
  console.error(annotate ? `::error title=Feature flag expired::${line}` : `FAIL: ${line}`);
}

if (failures.length > 0) {
  console.error(
    `\n${failures.length} flag(s) more than ${GRACE_DAYS} days past removeBy. ` +
      'Delete them (packages/flags/src/registry.ts and every call site) or move the date.',
  );
  process.exit(1);
}
console.log(
  `flags: ${Object.keys(FLAGS).length} registered, ${warnings.length} past removeBy, none expired (${today})`,
);
