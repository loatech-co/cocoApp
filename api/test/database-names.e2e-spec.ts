import { startApp, type TestEnvironment } from './helpers/app';

/**
 * Step 7.2-r5 (ADR 0026): the names of the constraints and indexes follow the
 * convention, in English, while tables and columns keep theirs behind `@map`.
 *
 * `pk_<table>`, `fk_<table>_<column>`, `uq_…`, `idx_…` and `ck_…`. Only
 * Prisma's own bookkeeping table keeps the name Prisma gives it.
 */
describe('Database constraint and index names (e2e)', () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await startApp();
  });

  afterAll(async () => {
    await env.close();
  });

  it('names every constraint and index by the convention', async () => {
    const rows = await env.prisma.$queryRaw<{ name: string }[]>`
      SELECT conname AS name FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace AND conrelid <> '"_prisma_migrations"'::regclass
      UNION
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
      ORDER BY 1`;

    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows.map(({ name }) => name).filter((name) => !/^(pk|fk|uq|idx|ck)_/.test(name)),
    ).toEqual([]);
  });

  it('uses the English model names, not the physical ones', async () => {
    const rows = await env.prisma.$queryRaw<{ name: string }[]>`
      SELECT conname AS name FROM pg_constraint WHERE connamespace = 'public'::regnamespace
      UNION
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`;
    const names = rows.map(({ name }) => name);

    expect(names.filter((name) => /soportes|audit_log(?!s)|_tx_|_tt_/.test(name))).toEqual([]);
    expect(names).toEqual(
      expect.arrayContaining(['pk_receipts', 'pk_audit_logs', 'uq_tags_user_id_lower_name']),
    );
  });

  it('stamps updated_at on the tables that gained it', async () => {
    const rows = await env.prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'updated_at'
        AND data_type = 'timestamp with time zone' AND is_nullable = 'NO'
        AND column_default = 'CURRENT_TIMESTAMP'
      ORDER BY table_name`;

    expect(rows.map(({ table_name }) => table_name)).toEqual([
      'categories',
      'category_rules',
      'soportes',
      'tags',
      'transaction_splits',
      'transaction_tags',
      'user_preferences',
    ]);
  });
});
