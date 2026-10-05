// @ts-check
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

import { API_PORT, DATABASE_URL, GOTRUE_PORT, ROOT, requireTestDatabase } from './entorno.mjs';
import { startFakeGoTrue } from './gotrue-falso.mjs';

/**
 * The environment of the Playwright journeys, in ONE process: the fake GoTrue,
 * and the API — compiled, unchanged — serving the built SPA on the same origin,
 * exactly as production does (one app, one domain, first-party cookie).
 *
 * Steps, in order, before anything listens:
 *   1. The firewall: a local database named `*_test` (`entorno.mjs`).
 *   2. Create it if missing, apply the migrations, empty every table.
 *   3. Pin EVERY variable the API reads. The API also loads `api/.env.test`
 *      without overriding what is already set, so anything left unset here
 *      would be taken from a developer's file.
 *
 * Why not `node api/dist/main.js`: `main.ts` loads `api/.env` OVERRIDING the
 * environment (on purpose, for the hosting), so a developer's local database
 * would win over this one. The app is built here the way `main.ts` builds it
 * — `NestFactory` + `configureApp` — with the API e2e helper's one exception:
 * the rate limiter's store never counts, because twenty-four journeys from one
 * IP exceed 120 requests per minute. The limiter has its own API e2e test.
 */

/** Nest is loaded from the API's own dependencies: it is the API that runs. */
const fromApi = createRequire(join(ROOT, 'api', 'package.json'));
const API_DIST = join(ROOT, 'api', 'dist');
const SPA_DIST = join(ROOT, 'frontend', 'dist');
const RECEIPTS = join(tmpdir(), `coco-e2e-soportes-${API_PORT}`);
/**
 * The SPA is served from a copy outside the repo. Express's `sendFile` refuses
 * any path with a dot-segment, so from a checkout under `.claude/worktrees/`
 * every route answered 404 instead of `index.html`.
 */
const SPA_SERVED = join(tmpdir(), `coco-e2e-spa-${API_PORT}`);

async function prepareDatabase() {
  const name = requireTestDatabase(DATABASE_URL);

  const admin = new URL(DATABASE_URL);
  admin.pathname = '/postgres';
  const server = new pg.Client({ connectionString: admin.toString() });
  await server.connect();
  const { rowCount } = await server.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
  if (!rowCount) await server.query(`CREATE DATABASE "${name}"`);
  await server.end();

  const migrate = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: join(ROOT, 'api'),
    env: { ...process.env, DATABASE_URL, DIRECT_URL: DATABASE_URL },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  if (migrate.status !== 0) throw new Error('prisma migrate deploy failed');

  const db = new pg.Client({ connectionString: DATABASE_URL });
  await db.connect();
  const { rows } = await db.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  if (rows.length > 0) {
    const tables = rows.map((r) => `"${String(r.tablename)}"`).join(', ');
    await db.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  }
  await db.end();
}

/** @param {string} gotrueUrl */
function pinEnvironment(gotrueUrl) {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    PORT: String(API_PORT),
    LOG_LEVEL: 'warn',
    LOG_DIR: '',
    DATABASE_URL,
    DIRECT_URL: DATABASE_URL,
    PERMITIR_BASE_REMOTA: 'no',
    SUPABASE_URL: gotrueUrl,
    SUPABASE_ANON_KEY: 'e2e-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'e2e-service',
    // The accounts live in the fake above, so creating them is harmless.
    PERMITIR_AUTH_DESTRUCTIVA: 'si',
    JWT_SECRET: 'e2e-only-jwt-secret-at-least-32-characters',
    BOOTSTRAP_ADMIN_EMAIL: 'admin@recorridos.coco',
    CHECK_BREACHED_PASSWORDS: 'false',
    CORS_ORIGINS: `http://localhost:${API_PORT}`,
    SOPORTES_DIR: RECEIPTS,
    SOPORTES_STORAGE: 'disk',
    SOPORTES_BUCKET: 'e2e',
    AUTO_CHARGE: 'off',
    SPA_DIST_PATH: SPA_SERVED,
  });
}

async function startApi() {
  const { NestFactory } = fromApi('@nestjs/core');
  const { ConfigService } = fromApi('@nestjs/config');
  const { ThrottlerStorage } = fromApi('@nestjs/throttler');
  const { AppModule } = fromApi(join(API_DIST, 'app.module.js'));
  const { configureApp } = fromApi(join(API_DIST, 'bootstrap.js'));
  const { installBigIntSerializer } = fromApi(join(API_DIST, 'common/serialization/bigint.js'));
  const { whyTheEnvironmentIsInvalid } = fromApi(join(API_DIST, 'common/config/env.js'));
  const { porQueNoArrancar } = fromApi(join(API_DIST, 'common/entorno.js'));

  const problem = whyTheEnvironmentIsInvalid() ?? porQueNoArrancar();
  if (problem !== null) throw new Error(problem);

  installBigIntSerializer();
  const app = await NestFactory.create(AppModule, { logger: ['warn', 'error'] });
  // The limiter's store is swapped on the live instance, not through a testing
  // module: a testing module builds its providers before the HTTP adapter
  // exists, and `ServeStaticModule` then picks its no-op loader (no SPA).
  // The guard still runs whole; it is only that nothing is ever counted.
  const storage = app.get(ThrottlerStorage);
  storage.increment = () =>
    Promise.resolve({ totalHits: 0, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 });
  configureApp(app, app.get(ConfigService));
  await app.listen(API_PORT, '127.0.0.1');
  return app;
}

async function main() {
  for (const dist of [join(API_DIST, 'app.module.js'), join(SPA_DIST, 'index.html')]) {
    if (!existsSync(dist)) throw new Error(`Missing ${dist}: run "npm run e2e:build" first.`);
  }
  rmSync(SPA_SERVED, { recursive: true, force: true });
  cpSync(SPA_DIST, SPA_SERVED, { recursive: true });
  rmSync(RECEIPTS, { recursive: true, force: true });
  mkdirSync(RECEIPTS, { recursive: true });

  await prepareDatabase();
  const gotrue = await startFakeGoTrue({ port: GOTRUE_PORT });
  pinEnvironment(gotrue.url);
  const app = await startApi();
  console.log(`[e2e] API + SPA on http://localhost:${API_PORT}, fake GoTrue on ${gotrue.url}`);

  const stop = () => {
    void Promise.allSettled([app.close(), gotrue.close()]).then(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((/** @type {unknown} */ error) => {
  console.error('[e2e]', error instanceof Error ? error.message : error);
  process.exit(1);
});
