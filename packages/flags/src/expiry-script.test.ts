import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { FLAGS, GRACE_DAYS, type FlagName } from './index';

/**
 * The CI step itself, run as CI runs it: exit code and output at three dates
 * around the canary's removeBy. Reads the BUILT package, as CI does.
 */
const script = fileURLToPath(new URL('../../../scripts/ci/flags-expiry.mjs', import.meta.url));
const canary: FlagName = 'flags_canary';

function runOn(date: string): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, [script, date], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTIONS: 'false' },
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

function daysAfter(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

describe('scripts/ci/flags-expiry.mjs', () => {
  const removeBy = FLAGS[canary].removeBy;

  it('passes quietly before removeBy', () => {
    const { status, output } = runOn(removeBy);
    expect(status).toBe(0);
    expect(output).not.toContain('warn:');
  });

  it('passes with a warning inside the grace period', () => {
    const { status, output } = runOn(daysAfter(removeBy, GRACE_DAYS));
    expect(status).toBe(0);
    expect(output).toContain(`warn: ${canary}`);
  });

  it('fails past the grace period', () => {
    const { status, output } = runOn(daysAfter(removeBy, GRACE_DAYS + 1));
    expect(status).toBe(1);
    expect(output).toContain(`FAIL: ${canary}`);
  });
});
