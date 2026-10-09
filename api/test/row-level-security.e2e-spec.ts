import { makeAccount, makeConcept, makeTransaction } from './factories';
import { startApp, type TestEnvironment, type TestUser } from './helpers/app';
import type { PrismaClient } from '../src/generated/prisma/client';
import { UsersRepository } from '../src/modules/auth/users.repository';
import { AutoChargeTask } from '../src/modules/dashboard/auto-charge.task';
import { Database, type UserTx } from '../src/prisma/database';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Step 7.11-b: the database's second lock (ADR 0019).
 *
 * `user-isolation.e2e-spec.ts` proves the CODE never lets one user reach
 * another. This proves that if it did —a repository that forgot its
 * `user_id`— the DATABASE would still not hand over the rows. Every query
 * here is written the way the bug would be: no owner in the `where`.
 *
 * It only means something if the app runs as a role without BYPASSRLS, so
 * the first test checks exactly that.
 */

/** The tables that hold a user's rows, directly or through their parent. */
const USER_TABLES = [
  'accounts',
  'categories',
  'category_rules',
  'import_batches',
  'import_rows',
  'soportes',
  'tags',
  'transaction_splits',
  'transaction_tags',
  'transactions',
  'user_preferences',
] as const;

/** One row in every user table, so a leak in any of them shows up. */
async function seedEverything(db: PrismaClient, userId: bigint, mark: string): Promise<void> {
  const account = await makeAccount(db, userId, { name: `${mark} cuenta` });
  const { concept } = await makeConcept(db, userId, {
    concept: {
      name: `${mark} concepto`,
      isRecurring: true,
      periodicity: 'monthly',
      paymentDay: 1,
      isAutoPaid: true,
      budget: '10',
    },
  });
  const transaction = await makeTransaction(db, userId, {
    accountId: account.id,
    categoryId: concept.id,
    description: mark,
  });
  const tag = await db.tag.create({ data: { userId, name: `${mark} etiqueta` } });

  await db.transactionSplit.create({
    data: { transactionId: transaction.id, categoryId: concept.id, amount: '1000' },
  });
  await db.transactionTag.create({ data: { transactionId: transaction.id, tagId: tag.id } });
  await db.categoryRule.create({ data: { userId, pattern: mark, categoryId: concept.id } });
  await db.userPreference.create({ data: { userId, prefKey: 'tema', prefValue: mark } });
  await db.receipt.create({
    data: {
      userId,
      transactionId: transaction.id,
      fileName: `${mark}.pdf`,
      mimeType: 'application/pdf',
      storageKey: `${userId}/${mark}.pdf`,
      sizeBytes: 1,
      contentHash: 'a'.repeat(64),
    },
  });
  const batch = await db.importBatch.create({ data: { userId } });
  await db.importRow.create({
    data: {
      batchId: batch.id,
      position: 1,
      date: new Date('2026-09-10'),
      amount: '1000',
      fingerprint: 'b'.repeat(64),
    },
  });
}

/** The ids of one user's seeded rows, read as the owner. */
async function rowsOf(db: PrismaClient, userId: bigint) {
  const transaction = await db.transaction.findFirstOrThrow({ where: { userId } });
  const concept = await db.category.findFirstOrThrow({ where: { userId, isRecurring: true } });
  const account = await db.account.findFirstOrThrow({ where: { userId } });
  const tag = await db.tag.findFirstOrThrow({ where: { userId } });
  const batch = await db.importBatch.findFirstOrThrow({ where: { userId } });
  return {
    transaction: transaction.id,
    concept: concept.id,
    account: account.id,
    tag: tag.id,
    batch: batch.id,
  };
}

async function countAll(
  run: (sql: string) => Promise<{ n: number }[]>,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of USER_TABLES) {
    const [row] = await run(`SELECT count(*)::int AS n FROM ${table}`);
    counts[table] = row?.n ?? -1;
  }
  return counts;
}

describe('Row-level security (e2e)', () => {
  let env: TestEnvironment;
  let db: Database;
  let appClient: PrismaService;
  let ana: TestUser;
  let bruno: TestUser;

  beforeAll(async () => {
    env = await startApp();
    db = env.app.get(Database);
    appClient = env.app.get(PrismaService);
  });

  afterAll(async () => {
    await env.close();
  });

  beforeEach(async () => {
    await env.clean();
    ana = await env.createUser({ displayName: 'Ana' });
    bruno = await env.createUser({ displayName: 'Bruno' });
    await seedEverything(env.prisma, ana.id, 'ANA');
    await seedEverything(env.prisma, bruno.id, 'BRUNO');
  });

  it('the app runs as coco_app: no BYPASSRLS, not the owner of the tables', async () => {
    const [who] = await appClient.$queryRaw<
      { role: string; bypass: boolean; owns: boolean }[]
    >`SELECT current_user AS role,
             (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass,
             (SELECT tableowner = current_user FROM pg_tables
               WHERE schemaname = 'public' AND tablename = 'transactions') AS owns`;
    expect(who).toEqual({ role: 'coco_app', bypass: false, owns: false });
  });

  it('every public table has row security enabled, forced, and a policy', async () => {
    const tables = await env.prisma.$queryRaw<
      { name: string; enabled: boolean; forced: boolean; policies: number }[]
    >`SELECT c.relname AS name, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced,
             (SELECT count(*)::int FROM pg_policies p
               WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'`;

    expect(tables.length).toBeGreaterThanOrEqual(13);
    const unprotected = tables.filter((t) => !t.enabled || !t.forced || t.policies === 0);
    expect(unprotected).toEqual([]);
  });

  it('a read with no owner in the where returns only the unit’s user', async () => {
    const asAna = await db.forUser(ana.id, (tx) =>
      countAll((sql) => tx.$queryRawUnsafe<{ n: number }[]>(sql)),
    );
    // Both users were seeded the same way: Ana's share is exactly half.
    const everyone = await countAll((sql) => env.prisma.$queryRawUnsafe<{ n: number }[]>(sql));
    for (const table of USER_TABLES) {
      expect(everyone[table]).toBeGreaterThan(0);
      expect([table, asAna[table]]).toEqual([table, (everyone[table] ?? 0) / 2]);
    }

    const descriptions = await db.forUser(ana.id, (tx) =>
      tx.transaction.findMany({ select: { description: true } }),
    );
    expect(descriptions).toEqual([{ description: 'ANA' }]);
  });

  it('a query outside forUser sees no user rows at all', async () => {
    // Run one unit first, so the pooled connection has held the setting: a
    // transaction-local value reads back as '' afterwards, not as NULL.
    await db.forUser(ana.id, (tx) => tx.transaction.count());

    const outside = await countAll((sql) => appClient.$queryRawUnsafe<{ n: number }[]>(sql));
    for (const table of USER_TABLES) expect([table, outside[table]]).toEqual([table, 0]);
    expect(await appClient.transaction.findMany()).toEqual([]);
  });

  it('a write with no owner in the where leaves the other user’s rows alone', async () => {
    await db.forUser(ana.id, async (tx) => {
      await tx.transaction.updateMany({ data: { notes: 'tocado' } });
      await tx.transactionTag.deleteMany({});
      await tx.transactionSplit.deleteMany({});
      await tx.receipt.deleteMany({});
      await tx.transaction.deleteMany({});
      await tx.tag.deleteMany({});
    });

    const brunosRows = await countAll((sql) => env.prisma.$queryRawUnsafe<{ n: number }[]>(sql));
    for (const table of [
      'transactions',
      'transaction_splits',
      'transaction_tags',
      'soportes',
      'tags',
    ]) {
      expect([table, brunosRows[table]]).toEqual([table, 1]);
    }
    const left = await env.prisma.transaction.findFirstOrThrow({ where: { userId: bruno.id } });
    expect(left.notes).toBeNull();
  });

  it('a row written for another user is refused by the database', async () => {
    await expect(
      db.forUser(ana.id, (tx) =>
        tx.account.create({ data: { userId: bruno.id, name: 'Intrusa', type: 'cash' } }),
      ),
    ).rejects.toThrow(/row-level security/);

    const brunosTx = await env.prisma.transaction.findFirstOrThrow({ where: { userId: bruno.id } });
    await expect(
      db.forUser(ana.id, (tx) =>
        tx.transactionSplit.create({ data: { transactionId: brunosTx.id, amount: '1' } }),
      ),
    ).rejects.toThrow(/row-level security/);

    expect(await env.prisma.account.count({ where: { name: 'Intrusa' } })).toBe(0);
  });

  it('a unit of work cannot switch users halfway', async () => {
    await expect(
      db.forUser(ana.id, () => db.forUser(bruno.id, (tx) => tx.transaction.count())),
    ).rejects.toThrow('A unit of work cannot switch users');
  });

  it('nested units for the same user share one transaction', async () => {
    const ids = await db.forUser(ana.id, async (outer) => {
      const [o] = await outer.$queryRaw<{ id: string }[]>`SELECT txid_current()::text AS id`;
      const inner = await db.forUser(
        ana.id,
        (tx) => tx.$queryRaw<{ id: string }[]>`SELECT txid_current()::text AS id`,
      );
      return [o?.id, inner[0]?.id];
    });
    expect(ids[0]).toBeDefined();
    expect(ids[0]).toBe(ids[1]);
  });

  it('the audit log: anyone appends, only an active admin reads', async () => {
    await appClient.auditLog.createMany({ data: [{ entity: 'auth', action: 'login_failed' }] });
    await env.prisma.auditLog.create({ data: { userId: bruno.id, entity: 'auth', action: 'x' } });

    expect(await db.forUser(ana.id, (tx) => tx.auditLog.count())).toBe(0);

    const admin = await env.createUser({ role: 'admin' });
    expect(await db.forUser(admin.id, (tx) => tx.auditLog.count())).toBe(2);

    await expect(db.forUser(admin.id, (tx) => tx.auditLog.deleteMany({}))).rejects.toThrow(
      /permission denied/,
    );
  });

  it('the auto-charge sweep still finds every owner through its one definer function', async () => {
    const created = await env.app.get(AutoChargeTask).runOnce(new Date('2026-10-20T15:00:00Z'));
    expect(created).toBe(2);
    const charged = await env.prisma.transaction.groupBy({
      by: ['userId'],
      where: { externalRef: { not: null } },
      _count: true,
    });
    expect(charged.map((c) => c.userId).sort()).toEqual([ana.id, bruno.id].sort());
  });

  it('rows that hang from another user’s movement: not read, moved or deleted through the child', async () => {
    const theirs = await rowsOf(env.prisma, bruno.id);

    const seen = await db.forUser(ana.id, async (tx) => ({
      splits: await tx.transactionSplit.count({ where: { transactionId: theirs.transaction } }),
      tags: await tx.transactionTag.count({ where: { transactionId: theirs.transaction } }),
      rows: await tx.importRow.count({ where: { batchId: theirs.batch } }),
    }));
    expect(seen).toEqual({ splits: 0, tags: 0, rows: 0 });

    await db.forUser(ana.id, async (tx) => {
      await tx.transactionSplit.updateMany({ data: { amount: '7' } });
      await tx.importRow.updateMany({ data: { description: 'tocado' } });
      await tx.transactionSplit.deleteMany({ where: { transactionId: theirs.transaction } });
      await tx.transactionTag.deleteMany({ where: { tagId: theirs.tag } });
      await tx.importRow.deleteMany({ where: { batchId: theirs.batch } });
    });

    const split = await env.prisma.transactionSplit.findFirstOrThrow({
      where: { transactionId: theirs.transaction },
    });
    expect(split.amount.toString()).toBe('1000');
    expect(await env.prisma.transactionTag.count({ where: { tagId: theirs.tag } })).toBe(1);
    const row = await env.prisma.importRow.findFirstOrThrow({ where: { batchId: theirs.batch } });
    expect(row.description).toBeNull();
  });

  it('a row of mine cannot point at a row of another user', async () => {
    const mine = await rowsOf(env.prisma, ana.id);
    const theirs = await rowsOf(env.prisma, bruno.id);

    // Every foreign key that leads from a user's row to another user's row.
    // The key alone does not stop it: Postgres checks a foreign key as the
    // table's owner, without the policies.
    const attempts: [string, (tx: UserTx) => Promise<unknown>][] = [
      [
        'a split of my movement on their concept',
        (tx) =>
          tx.transactionSplit.create({
            data: { transactionId: mine.transaction, categoryId: theirs.concept, amount: '1' },
          }),
      ],
      [
        'my split moved to their concept',
        (tx) =>
          tx.transactionSplit.updateMany({
            where: { transactionId: mine.transaction },
            data: { categoryId: theirs.concept },
          }),
      ],
      [
        'their tag on my movement',
        (tx) =>
          tx.transactionTag.create({
            data: { transactionId: mine.transaction, tagId: theirs.tag },
          }),
      ],
      [
        'my movement on their concept',
        (tx) =>
          tx.transaction.update({
            where: { id: mine.transaction },
            data: { categoryId: theirs.concept },
          }),
      ],
      [
        'my movement on their account',
        (tx) =>
          tx.transaction.update({
            where: { id: mine.transaction },
            data: { accountId: theirs.account },
          }),
      ],
      [
        'my movement in their import batch',
        (tx) =>
          tx.transaction.update({
            where: { id: mine.transaction },
            data: { importBatchId: theirs.batch },
          }),
      ],
      [
        'my concept under their category',
        (tx) =>
          tx.category.update({ where: { id: mine.concept }, data: { parentId: theirs.concept } }),
      ],
      [
        'my rule on their concept',
        (tx) =>
          tx.categoryRule.create({
            data: { userId: ana.id, pattern: 'x', categoryId: theirs.concept },
          }),
      ],
      [
        'my receipt on their movement',
        (tx) =>
          tx.receipt.updateMany({
            where: { userId: ana.id },
            // Another fingerprint: both users' seeded receipts share one.
            data: { transactionId: theirs.transaction, contentHash: 'c'.repeat(64) },
          }),
      ],
      [
        'my import batch on their account',
        (tx) =>
          tx.importBatch.update({ where: { id: mine.batch }, data: { accountId: theirs.account } }),
      ],
      [
        'my imported row on their concept',
        (tx) =>
          tx.importRow.updateMany({
            where: { batchId: mine.batch },
            data: { categoryId: theirs.concept },
          }),
      ],
      [
        'my imported row as a copy of their movement',
        (tx) =>
          tx.importRow.updateMany({
            where: { batchId: mine.batch },
            data: { duplicateOfId: theirs.transaction },
          }),
      ],
    ];

    // Each attempt in its own unit, and every one reported, not just the first.
    const notRefused: string[] = [];
    for (const [what, attempt] of attempts) {
      const outcome = await db.forUser(ana.id, attempt).then(
        () => 'accepted',
        (error: unknown) => (error instanceof Error ? error.message : String(error)),
      );
      if (!outcome.includes('row-level security')) notRefused.push(`${what}: ${outcome}`);
    }
    expect(notRefused).toEqual([]);

    // The same references to her own rows still go through.
    await db.forUser(ana.id, async (tx) => {
      await tx.transactionSplit.create({
        data: { transactionId: mine.transaction, categoryId: mine.concept, amount: '1' },
      });
      await tx.importRow.updateMany({
        where: { batchId: mine.batch },
        data: { categoryId: mine.concept, duplicateOfId: mine.transaction },
      });
    });
  });

  it('the users directory: readable for the guard, never deleted by the app', async () => {
    expect(await appClient.user.count()).toBeGreaterThanOrEqual(2);
    await expect(appClient.user.delete({ where: { id: bruno.id } })).rejects.toThrow(
      /permission denied/,
    );
    expect(await env.prisma.user.count({ where: { id: bruno.id } })).toBe(1);
  });

  it('the users directory: the app writes only the session columns, never the role or the status', async () => {
    await appClient.user.update({
      where: { id: ana.id },
      data: { lastLoginAt: new Date(), sessionsValidFrom: new Date() },
    });

    for (const data of [{ role: 'admin' as const }, { status: 'suspended' as const }]) {
      await expect(appClient.user.update({ where: { id: ana.id }, data })).rejects.toThrow(
        /permission denied/,
      );
    }
    await expect(
      db.forUser(ana.id, (tx) =>
        tx.user.update({ where: { id: ana.id }, data: { role: 'admin' } }),
      ),
    ).rejects.toThrow(/permission denied/);

    expect(
      await env.prisma.user.findUniqueOrThrow({
        where: { id: ana.id },
        select: { role: true, status: true },
      }),
    ).toEqual({ role: 'user', status: 'active' });
  });

  it('role and status change only through the admin path, as an active admin', async () => {
    const users = env.app.get(UsersRepository);
    const grant = (actor: bigint) => users.setAccess(actor, ana.id, { role: 'admin' });

    // Ana promoting herself, Bruno promoting her, and nobody at all.
    await expect(grant(ana.id)).rejects.toThrow(/not an active admin/);
    await expect(grant(bruno.id)).rejects.toThrow(/not an active admin/);
    await expect(
      appClient.$executeRaw`SELECT app_private.set_user_access(${ana.id}, NULL, 'admin', false)`,
    ).rejects.toThrow(/not an active admin/);

    const admin = await env.createUser({ role: 'admin' });
    await env.prisma.user.update({ where: { id: bruno.id }, data: { status: 'pending' } });
    const approved = await users.setAccess(admin.id, bruno.id, { status: 'active', approve: true });
    expect(approved).toMatchObject({ status: 'active', role: 'user', approvedById: admin.id });
    expect(approved.approvedAt).not.toBeNull();

    // A suspended admin is no longer one.
    await env.prisma.user.update({ where: { id: admin.id }, data: { status: 'suspended' } });
    await expect(grant(admin.id)).rejects.toThrow(/not an active admin/);
    expect((await env.prisma.user.findUniqueOrThrow({ where: { id: ana.id } })).role).toBe('user');
  });

  it('the definer functions: the two listed, and only to the app', async () => {
    const definers = await env.prisma.$queryRaw<{ name: string }[]>`
      SELECT p.proname AS name
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('public', 'app_private') AND p.prosecdef
      ORDER BY p.proname`;
    expect(definers).toEqual([{ name: 'auto_paid_owner_ids' }, { name: 'set_user_access' }]);

    const shapes = await env.prisma.$queryRaw<{ result: string; anyone: boolean }[]>`
      SELECT pg_get_function_result(p.oid) AS result,
             has_function_privilege('public', p.oid, 'EXECUTE') AS anyone
      FROM pg_proc p WHERE p.proname IN ('auto_paid_owner_ids', 'set_user_access')
      ORDER BY p.proname`;
    expect(shapes).toEqual([
      { result: 'SETOF bigint', anyone: false },
      { result: 'void', anyone: false },
    ]);
  });
});
