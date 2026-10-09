/**
 * Boots the API in-process for the performance scripts, the way the e2e
 * helper does it: Nest testing module, `configureApp`, a throttler store that
 * never blocks, and Supabase Auth replaced by a stub that knows one fixed
 * access token and one fixed refresh token. Nothing leaves the machine.
 *
 * It refuses to start unless the database is local and named `coco_bench*`
 * (see bench-db.sh). It does not serve the SPA: SpaModule picks its loader
 * from the HTTP adapter, which a testing module does not have yet when it is
 * compiled, so lighthouse.mjs puts `vite preview` in front instead.
 *
 * Needs `npm run build --workspace api` first: it loads `api/dist`, or the
 * build in `COCO_BENCH_API_DIST`.
 */
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir, userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import pg from 'pg';

const ACCESS_TOKEN = 'bench.access';
const REFRESH_TOKEN = 'bench.refresh';

function benchDatabaseUrl(
  url = process.env.COCO_BENCH_DATABASE_URL ??
    `postgresql://${userInfo().username}@localhost:5432/coco_bench`,
) {
  const parsed = new URL(url);
  const name = parsed.pathname.replace(/^\//, '');
  if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || !name.startsWith('coco_bench')) {
    throw new Error(`bench: only a local coco_bench* database, not ${parsed.hostname}/${name}`);
  }
  return url;
}

/** @param {{ port?: number }} options */
export async function startBenchApi({ port = 0 } = {}) {
  // The owner finds the user and cleans up; the API connects as
  // COCO_BENCH_APP_DATABASE_URL when set (`coco_app`, under row-level
  // security, as production), or as the owner. With coco_app the API's own
  // client sees no rows outside a unit of work, so it cannot do either.
  const url = benchDatabaseUrl();
  const appUrl = benchDatabaseUrl(process.env.COCO_BENCH_APP_DATABASE_URL ?? url);
  if (new URL(appUrl).pathname !== new URL(url).pathname) {
    throw new Error('bench: COCO_BENCH_APP_DATABASE_URL must be the same database');
  }
  const repo = resolve(import.meta.dirname, '../..');

  // Before anything from the API is loaded: Prisma and ConfigModule both read
  // process.env first and neither overwrites what is already there.
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: appUrl,
    DIRECT_URL: url,
    LOG_LEVEL: 'silent',
    JWT_SECRET: 'bench-only-secret-never-used-anywhere-else',
    CHECK_BREACHED_PASSWORDS: 'false',
    CORS_ORIGINS: 'http://localhost:5173',
    SOPORTES_DIR: mkdtempSync(join(tmpdir(), 'coco-bench-soportes-')),
    SOPORTES_STORAGE: 'disk',
  });

  const api = join(repo, 'api');
  const req = createRequire(join(api, 'package.json'));
  // COCO_BENCH_API_DIST points at another build of the API, to compare a
  // change against the code before it in the same conditions (A/B).
  const dist = process.env.COCO_BENCH_API_DIST ?? join(api, 'dist');
  const fromDist = (path) => req(join(dist, path));

  const { Test } = req('@nestjs/testing');
  const { ConfigService } = req('@nestjs/config');
  const { ThrottlerStorage } = req('@nestjs/throttler');
  const { AppModule } = fromDist('app.module.js');
  const { configureApp } = fromDist('bootstrap.js');
  const { installBigIntSerializer } = fromDist('common/serialization/bigint.js');
  const { SupabaseAuthService } = fromDist('modules/auth/supabase-auth.service.js');

  let authId = '';
  const session = () => ({
    accessToken: ACCESS_TOKEN,
    refreshToken: REFRESH_TOKEN,
    expiresIn: 3600,
    authId,
    email: 'bench@local',
  });

  installBigIntSerializer();
  const builder = Test.createTestingModule({ imports: [AppModule] });
  builder.overrideProvider(SupabaseAuthService).useValue({
    verifyAccessToken: (token) =>
      token === ACCESS_TOKEN
        ? Promise.resolve({ authId, email: 'bench@local', iatMs: Date.now() })
        : Promise.reject(new Error('bench: unknown token')),
    refresh: (token) => Promise.resolve(token === REFRESH_TOKEN ? session() : null),
    signOut: () => Promise.resolve(),
  });
  builder.overrideProvider(ThrottlerStorage).useValue({
    increment: () =>
      Promise.resolve({ totalHits: 0, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
  });

  const app = (await builder.compile()).createNestApplication({ logger: false });
  configureApp(app, app.get(ConfigService));
  await app.init();
  await app.listen(port, '127.0.0.1');
  const origin = `http://127.0.0.1:${app.getHttpServer().address().port}`;

  const owner = new pg.Client({ connectionString: url });
  await owner.connect();
  const {
    rows: [{ db }],
  } = await owner.query('SELECT current_database()::text AS db');
  if (!db.startsWith('coco_bench')) throw new Error(`bench: connected to ${db}`);

  // The user with the most movements: that is the realistic one.
  const {
    rows: [top],
  } = await owner.query(
    `SELECT u.id::text AS id, u.auth_id::text AS auth_id, count(*)::int AS rows
       FROM transactions t JOIN users u ON u.id = t.user_id
      GROUP BY u.id ORDER BY count(*) DESC LIMIT 1`,
  );
  authId = top.auth_id;

  return {
    origin,
    base: `${origin}/api/v2`,
    database: db,
    rows: top.rows,
    /** The captures write rows: take them back out so the next run starts equal. */
    removeBenchRows: () =>
      owner.query(`DELETE FROM transactions WHERE user_id = $1 AND external_ref LIKE 'bench-%'`, [
        top.id,
      ]),
    accessToken: ACCESS_TOKEN,
    refreshToken: REFRESH_TOKEN,
    close: async () => {
      await app.close();
      await owner.end();
    },
  };
}
