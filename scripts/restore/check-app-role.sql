-- The privileges of the application role after a restore (restore.sh, step
-- 7): what the migrations narrowed (20261006000000, …200 and …300) must
-- still be narrow, what they granted must be there, and the defaults the
-- restore re-creates must cover the NEXT table a migration adds (ADR 0033).
-- Row-level security must have come back too: forced on every table of
-- `public` (except _prisma_migrations) and with every policy.
--
-- Run with psql -v role=<role> -v expected_policies=<n>; prints the names of
-- the failed checks, or nothing. `aclexplode` instead of `makeaclitem`: the
-- latter takes a list of privileges only since Postgres 16, and the target
-- may be older.
--
-- Functions go through `to_regprocedure`, which gives NULL instead of an
-- error when the function is not there: a backup taken before a migration
-- that adds one (20261010003334 was pending in production for days) must
-- still pass its restore test, or no valid backup can ever be made (round 5,
-- B1). A narrowed function that is missing is fine (`coalesce(…, false)`:
-- nothing to narrow); a granted one that is missing is reported.
WITH owner AS (
  SELECT relowner AS oid FROM pg_class WHERE oid = 'public.users'::regclass
),
defaults AS (
  SELECT d.defaclobjtype AS kind, a.privilege_type AS privilege
  FROM pg_default_acl d
  CROSS JOIN LATERAL aclexplode(d.defaclacl) a
  WHERE d.defaclnamespace = 'public'::regnamespace
    AND d.defaclrole = (SELECT oid FROM owner)
    AND a.grantee = :'role'::regrole
),
executes AS (
  SELECT name, coalesce(has_function_privilege(:'role', to_regprocedure(signature)::oid, 'EXECUTE'), false) AS can
  FROM (VALUES
    ('guard_users_access', 'app_private.guard_users_access()'),
    ('set_user_access', 'app_private.set_user_access(bigint, public."UserStatus", public."UserRole", boolean)'),
    ('is_own_category', 'app_private.is_own_category(bigint)'),
    ('auto_paid_owner_ids', 'app_private.auto_paid_owner_ids()')
  ) AS f(name, signature)
)
SELECT string_agg(name, ', ') FROM (VALUES
  -- narrowed
  ('users DELETE', has_table_privilege(:'role', 'public.users', 'DELETE')),
  ('users.role UPDATE', has_column_privilege(:'role', 'public.users', 'role', 'UPDATE')),
  ('users.status UPDATE', has_column_privilege(:'role', 'public.users', 'status', 'UPDATE')),
  ('users.approved_at UPDATE', has_column_privilege(:'role', 'public.users', 'approved_at', 'UPDATE')),
  ('users.approved_by_id UPDATE', has_column_privilege(:'role', 'public.users', 'approved_by_id', 'UPDATE')),
  ('audit_log UPDATE', has_table_privilege(:'role', 'public.audit_log', 'UPDATE')),
  ('audit_log DELETE', has_table_privilege(:'role', 'public.audit_log', 'DELETE')),
  ('_prisma_migrations SELECT', has_table_privilege(:'role', 'public._prisma_migrations', 'SELECT')),
  ('public CREATE', has_schema_privilege(:'role', 'public', 'CREATE')),
  ('guard_users_access EXECUTE', (SELECT can FROM executes WHERE name = 'guard_users_access')),
  -- granted
  ('no users SELECT', NOT has_table_privilege(:'role', 'public.users', 'SELECT')),
  ('no users.last_login_at UPDATE', NOT has_column_privilege(:'role', 'public.users', 'last_login_at', 'UPDATE')),
  ('no audit_log INSERT', NOT has_table_privilege(:'role', 'public.audit_log', 'INSERT')),
  ('no transactions DELETE', NOT has_table_privilege(:'role', 'public.transactions', 'DELETE')),
  ('no public USAGE', NOT has_schema_privilege(:'role', 'public', 'USAGE')),
  ('no app_private USAGE', NOT has_schema_privilege(:'role', 'app_private', 'USAGE')),
  ('no set_user_access EXECUTE', NOT (SELECT can FROM executes WHERE name = 'set_user_access')),
  ('no is_own_category EXECUTE', NOT (SELECT can FROM executes WHERE name = 'is_own_category')),
  ('no auto_paid_owner_ids EXECUTE', NOT (SELECT can FROM executes WHERE name = 'auto_paid_owner_ids')),
  ('a sequence without USAGE+SELECT', EXISTS (
    SELECT 1 FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'S'
      AND NOT (has_sequence_privilege(:'role', oid, 'USAGE') AND has_sequence_privilege(:'role', oid, 'SELECT')))),
  -- row-level security, as scripts/check-data-api.sql counts it
  ('a public table without forced RLS', EXISTS (
    SELECT 1 FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
      AND relname <> '_prisma_migrations' AND NOT relforcerowsecurity)),
  ('policies <> ' || :'expected_policies',
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public') <> :'expected_policies'::int),
  -- defaults for the next migration, owned by whoever owns the tables
  ('no default table privileges', (SELECT count(DISTINCT privilege) FROM defaults
    WHERE kind = 'r' AND privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')) <> 4),
  ('no default sequence privileges', (SELECT count(DISTINCT privilege) FROM defaults
    WHERE kind = 'S' AND privilege IN ('USAGE', 'SELECT')) <> 2)
) AS checks(name, wrong) WHERE wrong;
