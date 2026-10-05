-- Step 7.11-b: FORCE row-level security (ADR 0019).
--
-- FORCE makes the policies apply to the table's OWNER too. It does not change
-- what `coco_app` sees (it is not the owner), nor what `postgres` sees in
-- Supabase (it has BYPASSRLS, which always wins). What it closes is the day
-- someone points the API at an owner role without BYPASSRLS: instead of
-- seeing every user's rows, it would see none.
--
-- The consequence for whoever owns the tables: it needs BYPASSRLS, or its
-- data fixes and scripts see zero rows. `postgres` in Supabase has it;
-- locally, scripts/db/create-app-role.sh gives it to the migration role.
--
-- In its own migration so it reads as the last step of the rollout
-- (docs/rls-rollout.md), and so reverting it is one statement per table.
ALTER TABLE public.accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE public.categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.category_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.import_rows FORCE ROW LEVEL SECURITY;
ALTER TABLE public.soportes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tags FORCE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_splits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_tags FORCE ROW LEVEL SECURITY;
ALTER TABLE public.transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;
