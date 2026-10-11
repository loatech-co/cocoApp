-- The four counts that say the data API is closed (run by
-- scripts/verify-data-api-closed.sh after every production migration):
--   tables_without_rls  0   every public table has row-level security
--   open_grants         0   anon/authenticated hold nothing
--   policies            14  one per table, all TO coco_app (ADR 0024)
--   unforced            0   FORCE on every table but _prisma_migrations
SELECT
  (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity) AS tables_without_rls,
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')) AS open_grants,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public') AS policies,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'
      AND NOT c.relforcerowsecurity) AS unforced;
