import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * A user's rows are reached through `Database.forUser` and nothing else
 * (ADR 0019). This reads the source and fails if a file injects the raw
 * `PrismaService`, outside the exceptions below, or if an exception uses it
 * for more than its reason covers.
 *
 * Row-level security is the second lock: a query that skips `forUser` sees no
 * rows in production. This is the first one, so the mistake shows up in the
 * pull request instead of as an empty screen.
 */
const SRC = join(__dirname, '..');

/** Files allowed to use `PrismaService`, why, and the only calls they may make with it. */
const ALLOWED: Record<string, { reason: string; calls: readonly string[] }> = {
  'prisma/prisma.service.ts': { reason: 'it is the client', calls: [] },
  'prisma/prisma.module.ts': { reason: 'it provides the client', calls: [] },
  'prisma/database.ts': { reason: 'it opens the units of work', calls: ['$transaction'] },
  'modules/auth/users.repository.ts': {
    reason:
      'the users directory: the guard reads it before it knows who the user is, ' +
      'and its policy is open to the app on purpose',
    calls: ['user'],
  },
  'modules/health/health.repository.ts': {
    reason: '`/ready` runs SELECT 1 and reads no table',
    calls: ['$queryRaw'],
  },
  'common/audit/audit.repository.ts': {
    reason: 'appends an entry that may have no user (a failed login); reads go through forUser',
    calls: ['auditLog.createMany'],
  },
  'modules/categories/category-lookup.repository.ts': {
    reason: 'the auto-charge sweep calls its one SECURITY DEFINER function',
    calls: ['$queryRaw'],
  },
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

const files = sourceFiles(SRC).map((path) => ({
  name: relative(SRC, path),
  text: readFileSync(path, 'utf8'),
}));

describe('database access rule', () => {
  it('only the listed files touch PrismaService', () => {
    const offenders = files
      .filter((f) => /\bPrismaService\b/.test(f.text) && !(f.name in ALLOWED))
      .map((f) => f.name);
    expect(offenders).toEqual([]);
  });

  it('each exception uses PrismaService only for what its reason covers', () => {
    const misuse: string[] = [];
    for (const f of files.filter((file) => file.name in ALLOWED)) {
      const allowed = ALLOWED[f.name]?.calls ?? [];
      for (const [, call] of f.text.matchAll(/this\.prisma\.([\w$]+(?:\.\w+)?)/g)) {
        if (call && !allowed.some((a) => call === a || call.startsWith(`${a}.`))) {
          misuse.push(`${f.name}: this.prisma.${call}`);
        }
      }
    }
    expect(misuse).toEqual([]);
  });

  it('every exception still exists, so the list cannot rot', () => {
    const names = new Set(files.map((f) => f.name));
    expect(Object.keys(ALLOWED).filter((name) => !names.has(name))).toEqual([]);
  });

  it('every repository goes through Database', () => {
    const repositories = files.filter(
      (f) => f.name.endsWith('.repository.ts') && !(f.name in ALLOWED),
    );
    expect(repositories.length).toBeGreaterThan(5);
    const without = repositories
      .filter((f) => !f.text.includes('private readonly db: Database'))
      .map((f) => f.name);
    expect(without).toEqual([]);
  });
});
