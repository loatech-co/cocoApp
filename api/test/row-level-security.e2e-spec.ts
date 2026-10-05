import type { PrismaClient } from '@prisma/client';

import { makeAccount, makeConcept, makeTransaction } from './factories';
import { levantarApp, type EntornoDePruebas, type UsuarioDePrueba } from './helpers/app';
import { AutoChargeTask } from '../src/modules/dashboard/auto-charge.task';
import { Database } from '../src/prisma/database';
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
      recurrente: true,
      periodicidad: 'mensual',
      diaDePago: 1,
      pagoAutomatico: true,
      presupuesto: '10',
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
  await db.soporte.create({
    data: {
      userId,
      transactionId: transaction.id,
      nombreArchivo: `${mark}.pdf`,
      mimeType: 'application/pdf',
      storageKey: `${userId}/${mark}.pdf`,
      tamano: 1,
      huella: 'a'.repeat(64),
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
  let env: EntornoDePruebas;
  let db: Database;
  let appClient: PrismaService;
  let ana: UsuarioDePrueba;
  let bruno: UsuarioDePrueba;

  beforeAll(async () => {
    env = await levantarApp();
    db = env.app.get(Database);
    appClient = env.app.get(PrismaService);
  });

  afterAll(async () => {
    await env.cerrar();
  });

  beforeEach(async () => {
    await env.limpiar();
    ana = await env.crearUsuario({ displayName: 'Ana' });
    bruno = await env.crearUsuario({ displayName: 'Bruno' });
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
      await tx.soporte.deleteMany({});
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

    const admin = await env.crearUsuario({ role: 'admin' });
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
});
