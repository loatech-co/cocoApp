-- Step 7.11-b: row-level security, the database's second lock behind the
-- `user_id` filter every repository already writes (ADR 0019).
--
-- Additive and inert until the API changes role. The owner that runs the
-- migrations (`postgres` in Supabase) has BYPASSRLS, so while DATABASE_URL
-- still points at it nothing here changes a single result. The policies start
-- to act when DATABASE_URL moves to `coco_app` (docs/rls-rollout.md).
--
-- Written by hand: Prisma does not generate roles, grants or policies.
--
-- The setting the policies read is set by the API, transaction-local, as the
-- first statement of every unit of work (`Database.forUser`). It is read as
-- NULLIF(..., '')::bigint because a custom setting that was set LOCAL in an
-- earlier transaction on the same pooled connection reads back as '' — and
-- ''::bigint is an error. With NULLIF a query without a user sees zero rows,
-- the same on a fresh connection and on a reused one.

-- ── 1. The application role ────────────────────────────────────────────────
-- Created NOLOGIN here only as a fallback. Its LOGIN and its password come
-- from scripts/db/create-app-role.sh, which runs BEFORE this migration:
-- passwords are not versioned. If the role is missing and the migration role
-- cannot create roles, say so instead of failing with a bare 42501.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'coco_app') THEN
    CREATE ROLE coco_app NOLOGIN NOBYPASSRLS;
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE EXCEPTION 'The role coco_app does not exist: run scripts/db/create-app-role.sh first';
END $$;

-- ── 2. Only the privileges it needs ────────────────────────────────────────
-- Rows, not structure: no TRUNCATE, no REFERENCES, no TRIGGER, nothing on the
-- migrations table. The default privileges cover the tables a future
-- migration creates; their POLICY still has to be written (an e2e test fails
-- on a public table without row security).
GRANT USAGE ON SCHEMA public TO coco_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO coco_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO coco_app;
REVOKE ALL ON TABLE public._prisma_migrations FROM coco_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO coco_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO coco_app;

-- The audit log is append-only for the API: nothing in the code edits or
-- deletes an entry, so the role cannot either.
REVOKE UPDATE, DELETE ON TABLE public.audit_log FROM coco_app;

-- ── 3. Tables with a user_id: the row is the user's ───────────────────────
-- Every one of them already has an index that starts with user_id (checked
-- table by table for this step), so the policy adds no new index.
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY accounts_owner ON public.accounts FOR ALL TO coco_app
  USING (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint))
  WITH CHECK (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint));

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY categories_owner ON public.categories FOR ALL TO coco_app
  USING (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint))
  WITH CHECK (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint));

ALTER TABLE public.category_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY category_rules_owner ON public.category_rules FOR ALL TO coco_app
  USING (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint))
  WITH CHECK (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint));

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY import_batches_owner ON public.import_batches FOR ALL TO coco_app
  USING (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint))
  WITH CHECK (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint));

ALTER TABLE public.soportes ENABLE ROW LEVEL SECURITY;
CREATE POLICY soportes_owner ON public.soportes FOR ALL TO coco_app
  USING (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint))
  WITH CHECK (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint));

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY tags_owner ON public.tags FOR ALL TO coco_app
  USING (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint))
  WITH CHECK (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint));

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY transactions_owner ON public.transactions FOR ALL TO coco_app
  USING (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint))
  WITH CHECK (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint));

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_preferences_owner ON public.user_preferences FOR ALL TO coco_app
  USING (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint))
  WITH CHECK (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint));

-- ── 4. Tables without user_id: protected through their parent ──────────────
-- A split, a movement's tag and an imported row belong to whoever owns the
-- movement or the batch they hang from. The lookups use the parent's primary
-- key, and the child side already has its index (idx_splits_transaction, the
-- primary key of transaction_tags, idx_import_row_batch_position).
ALTER TABLE public.transaction_splits ENABLE ROW LEVEL SECURITY;
CREATE POLICY transaction_splits_via_transaction ON public.transaction_splits FOR ALL TO coco_app
  USING (EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = transaction_splits.transaction_id
      AND t.user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = transaction_splits.transaction_id
      AND t.user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint)));

ALTER TABLE public.transaction_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY transaction_tags_via_transaction ON public.transaction_tags FOR ALL TO coco_app
  USING (EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = transaction_tags.transaction_id
      AND t.user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = transaction_tags.transaction_id
      AND t.user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint)));

ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY import_rows_via_batch ON public.import_rows FOR ALL TO coco_app
  USING (EXISTS (
    SELECT 1 FROM public.import_batches b
    WHERE b.id = import_rows.batch_id
      AND b.user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.import_batches b
    WHERE b.id = import_rows.batch_id
      AND b.user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint)));

-- ── 5. users: the directory, open to the API on purpose ────────────────────
-- The auth guard reads this table by `auth_id` BEFORE it knows who the user
-- is, and the admin screens list every account. Keying it on the setting
-- would need a bypass on every request; the policy is explicit instead.
-- Row security stays ENABLED (the Supabase data API script turned it on) and
-- the policy is for coco_app only: `anon` and `authenticated` still have no
-- policy and no grant.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_directory ON public.users FOR ALL TO coco_app
  USING (true)
  WITH CHECK (true);

-- ── 6. audit_log: anyone appends, only an active admin reads ───────────────
-- A failed login is written with no user at all, and an admin's action is
-- written about someone else: the insert cannot be keyed on the setting. The
-- read is the admin log, so it is keyed on the setting's user being an
-- active admin. `users` has no per-row restriction, so the EXISTS cannot
-- recurse into another policy.
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_log_append ON public.audit_log FOR INSERT TO coco_app
  WITH CHECK (true);
CREATE POLICY audit_log_admin_read ON public.audit_log FOR SELECT TO coco_app
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint)
      AND u.role = 'admin'
      AND u.status = 'active'));

-- ── 7. The one query that crosses users ────────────────────────────────────
-- The daily auto-charge sweep needs to know WHICH users have an auto-paid
-- concept before it can work as each of them. This function answers only
-- that —ids, no data— and runs as its owner, which has BYPASSRLS. Each charge
-- afterwards runs inside `forUser`, under the policies above.
--
-- In its own schema, which the Supabase data API does not publish, with
-- EXECUTE taken from PUBLIC and given only to coco_app, and a fixed
-- search_path so a caller cannot redirect `categories` to a table of its own.
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO coco_app;

CREATE FUNCTION app_private.auto_paid_owner_ids()
  RETURNS SETOF bigint
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT DISTINCT c.user_id
  FROM public.categories c
  WHERE c.recurrente AND c.pago_automatico AND NOT c.is_archived
$$;

REVOKE ALL ON FUNCTION app_private.auto_paid_owner_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.auto_paid_owner_ids() TO coco_app;
