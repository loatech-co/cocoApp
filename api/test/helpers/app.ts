import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AbstractLoader, ExpressLoader } from '@nestjs/serve-static';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { PrismaPg } from '@prisma/adapter-pg';

import { SupabaseAuthFake } from './supabase-auth-fake';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { installBigIntSerializer } from '../../src/common/serialization/bigint';
import {
  PrismaClient,
  type User,
  type UserRole,
  type UserStatus,
} from '../../src/generated/prisma/client';
import { SupabaseAuthService } from '../../src/modules/auth/supabase-auth.service';

/**
 * End-to-end test environment against a real Postgres (a database ending in
 * `_test`, never the development one).
 *
 * Unlike the earlier Firebase setup, NOTHING on the authentication path is
 * replaced here: real JWTs are signed and verified, argon2 really hashes and
 * the global guard really queries the database. The auth is our own, so there
 * is no reason to fake it — testing it faked would be testing the fake.
 *
 * The only thing that can be switched off is the rate limiter, because it
 * counts attempts per minute and would fail suites that make many calls in a
 * row, for reasons that have nothing to do with what they are checking. A
 * dedicated test turns it on and checks that it is still alive.
 */
export interface TestEnvironment {
  app: INestApplication;
  /**
   * The database as its OWNER (`DIRECT_URL`), not as the app: fixtures,
   * cleanup and checks that look at every user's rows. The app itself runs
   * as `coco_app` (`DATABASE_URL`), under row-level security, so a test that
   * set up its data through the app's own client would see none of it.
   */
  prisma: PrismaClient;
  /** Creates a user ready to use, without going through the sign-up endpoint. */
  createUser: (data?: UserData) => Promise<TestUser>;
  /** The Supabase Auth double, to build cases the normal flow does not produce. */
  supabase: SupabaseAuthFake;
  /** `Authorization` header with a real access token for that user. */
  as: (user: TestUser) => string;
  clean: () => Promise<void>;
  close: () => Promise<void>;
}

interface UserData {
  email?: string;
  password?: string;
  displayName?: string;
  role?: UserRole;
  status?: UserStatus;
}

export interface TestUser extends User {
  /** The plain-text password, so the test can log in. */
  plainPassword: string;
  accessToken: string;
  refreshToken: string;
}

/**
 * A password that meets the whole policy: 16 characters, upper case, lower
 * case, digit and symbol, unlike the email or the name of the test accounts
 * (and without the word "coco", which the policy forbids).
 */
export const VALID_PASSWORD = 'Xk9$Ronda-Verde!';
/** A different one, for the password-change tests. */
export const NEW_PASSWORD = 'Zt4&Nube-Lejana!';

/**
 * Every test email lives under this domain. `clean()` does not use it —it
 * empties the whole database— but keeping it makes it obvious in any dump
 * which rows come from tests.
 */
const TEST_DOMAIN = 'pruebas.coco';

let counter = 0;

/** A unique email per call: avoids collisions between tests in the same file. */
export function testEmail(prefix = 'usuario'): string {
  counter += 1;
  return `${prefix}-${process.pid}-${counter}@${TEST_DOMAIN}`;
}

/**
 * Firewall: `clean()` empties EVERY table, so pointing at the wrong database
 * would be destructive. The database name is checked before anything starts;
 * nobody trusts that the right `.env` is loaded.
 */
function requireTestDatabase(): void {
  for (const variable of ['DATABASE_URL', 'DIRECT_URL']) {
    const url = process.env[variable] ?? '';
    const name = url.split('/').pop()?.split('?')[0] ?? '';

    if (!name.endsWith('_test')) {
      throw new Error(
        `The e2e tests empty the whole database and ${variable} is not a test one: "${name}". ` +
          'Check that .env.test is loaded (test/setup-env.ts).',
      );
    }
  }
}

export async function startApp(
  options: { withRateLimiter?: boolean } = {},
): Promise<TestEnvironment> {
  requireTestDatabase();
  installBigIntSerializer();

  const constructor = Test.createTestingModule({ imports: [AppModule] });

  // Supabase Auth is replaced by an in-memory double. Talking to the real
  // project would create real accounts on every run —there is no test project
  // on the free plan— and tie the tests to the network.
  // A testing module resolves its providers before the HTTP adapter exists,
  // so `ServeStaticModule` would pick its no-op loader and the SPA would never
  // be served. Production (`NestFactory.create`) gets the Express one.
  constructor.overrideProvider(AbstractLoader).useValue(new ExpressLoader());

  const supabase = new SupabaseAuthFake();
  constructor.overrideProvider(SupabaseAuthService).useValue(supabase);

  if (!options.withRateLimiter) {
    // The limiter's STORAGE is replaced, not the guard: `APP_GUARD` with
    // `useClass` instantiates the class directly and `overrideGuard` never
    // reaches it. With a storage that always reports zero hits, the guard
    // really runs —decorators, key resolution, everything— but never blocks.
    constructor.overrideProvider(ThrottlerStorage).useValue({
      increment: (): Promise<ThrottlerStorageRecord> =>
        Promise.resolve({
          totalHits: 0,
          timeToExpire: 60,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
    });
  }

  const moduleRef = await constructor.compile();

  const app = moduleRef.createNestApplication();
  // Exactly the same configuration that runs in production: prefix, cookies,
  // helmet, CORS and ValidationPipe. If it were duplicated here, the test
  // would check an app different from the one that is deployed.
  configureApp(app, app.get(ConfigService));
  await app.init();
  // Listen ONCE, for the whole suite. Handed a server that is not listening,
  // supertest opens it on a random port for each request and closes it after.
  // Node's global agent keeps sockets alive, so when the OS hands back a port
  // it already used, the next request goes out on a pooled socket the old
  // server closed: `socket hang up`. That was the flaky
  // `auth.e2e-spec.ts › a pending account cannot sign in…`.
  await app.listen(0, '127.0.0.1');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }),
  });

  const createUser = async (data: UserData = {}): Promise<TestUser> => {
    const password = data.password ?? VALID_PASSWORD;

    const email = data.email ?? testEmail();
    const authId = supabase.seed(email, password);

    const user = await prisma.user.create({
      data: {
        authId,
        email,
        displayName: data.displayName ?? 'Usuario de Pruebas',
        role: data.role ?? 'user',
        status: data.status ?? 'active',
        // To the second, as the real sign-up does: the token's `iat` has no
        // more precision, and a timestamp with milliseconds would shut out
        // the token issued right after.
        sessionsValidFrom: new Date(Math.floor(Date.now() / 1000) * 1000),
      },
    });

    // The session is opened straight against the double, without going
    // through POST /auth/login: most tests only need to "be in" and must not
    // spend the limiter's quota on it.
    const session = supabase.openSession(authId, email);

    return {
      ...user,
      plainPassword: password,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    };
  };

  /**
   * Empties the test database in dependency order.
   *
   * Deleting the users and trusting the CASCADE is not enough: the FK
   * `transactions.account_id` is RESTRICT on purpose —so nobody deletes an
   * account with history— and that blocks the cascade. And `audit_log.user_id`
   * is SetNull, so the audit rows would outlive the user.
   */
  const clean = async (): Promise<void> => {
    // splits and transaction_tags go by CASCADE from transactions.
    await prisma.transaction.deleteMany({});
    // import_rows goes by CASCADE from import_batches. The batches go BEFORE
    // the accounts: `import_batches.account_id` is RESTRICT, like the one on
    // transactions, so deleting an account does not take its history with it.
    await prisma.importBatch.deleteMany({});
    await prisma.categoryRule.deleteMany({});
    await prisma.tag.deleteMany({});
    // Children first: parent_id is SetNull, but this way it is deterministic.
    await prisma.category.deleteMany({ where: { parentId: { not: null } } });
    await prisma.category.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.auditLog.deleteMany({});
    // approved_by_id points at users: cleared first so the FK does not block.
    await prisma.user.updateMany({ data: { approvedById: null } });
    await prisma.user.deleteMany({});
    // The double keeps its accounts in memory and survives between tests of
    // the same file: without this, a reused email would collide with a ghost
    // account from the previous test.
    supabase.clear();
  };

  await clean();

  return {
    app,
    prisma,
    createUser,
    supabase,
    as: (user: TestUser) => `Bearer ${user.accessToken}`,
    clean,
    close: async () => {
      await clean();
      await prisma.$disconnect();
      await app.close();
    },
  };
}
