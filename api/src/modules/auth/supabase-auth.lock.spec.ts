import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The real-accounts lock, checked by reading the source code.
 *
 * ── Why this way and not by running it ───────────────────────────────────────
 * `supabase-auth.service.ts` imports `jose`, which ships only as ESM, and Jest
 * runs CommonJS: the file cannot be loaded in a test. It is the same reason
 * `isDuplicateEmail` lives in a separate module.
 *
 * Reading the source looks poor, but here it protects exactly what is needed:
 * that the lock is still there, and that nobody opens a shortcut around it.
 * It is the same technique `foco.test.ts` and `radio.test.ts` already use.
 */
describe('The lock on admin operations', () => {
  const source = readFileSync(join(__dirname, 'supabase-auth.service.ts'), 'utf8');

  it('the check is inside `call`', () => {
    const callBody = source.slice(source.indexOf('private async call('));
    const untilNextMethod = callBody.slice(0, callBody.indexOf('\n  private toSession'));

    expect(untilNextMethod).toContain("path.startsWith('/admin/')");
    expect(untilNextMethod).toContain('whyNotTouchRealAccounts');
  });

  it('and it is checked BEFORE going to the network', () => {
    // If the `fetch` came first, the lock would only hide the answer to an
    // operation that already happened.
    expect(source.indexOf('whyNotTouchRealAccounts')).toBeLessThan(source.indexOf('await fetch('));
  });

  it('there is no `fetch` outside `call`', () => {
    // The lock is only as good as this invariant: a second place talking to
    // GoTrue on its own would go right past it.
    const calls = source.match(/fetch\(/g) ?? [];
    expect(calls).toHaveLength(1);
  });

  it('the four dangerous operations still go through `/admin/`', () => {
    // If one stopped using that prefix, it would leave the lock silently.
    for (const method of ['signOutEverywhere', 'createUser', 'changePassword', 'deleteUser']) {
      const start = source.indexOf(`async ${method}(`);
      expect(start).toBeGreaterThan(-1);
      const body = source.slice(start, start + 600);
      expect(body).toContain('/admin/');
      expect(body).toContain('this.serviceKey');
    }
  });

  it('signing in and refreshing do NOT go through the lock', () => {
    // If signing in were blocked, the app could not be used locally, and the
    // lock would have traded a risk for an obstruction.
    for (const method of ['signIn', 'refresh']) {
      const start = source.indexOf(`async ${method}(`);
      const body = source.slice(start, start + 500);
      expect(body).not.toContain('/admin/');
    }
  });
});
