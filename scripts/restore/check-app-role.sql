-- The privileges of the application role after a restore (restore.sh, step
-- 7): what the migrations narrowed (20261006000000, …200 and …300) must
-- still be narrow, what they granted must be there, and the defaults the
-- restore re-creates must cover the NEXT table a migration adds (ADR 0033).
--
-- Run with psql -v role=<role>; prints the names of the failed checks, or
-- nothing. `aclexplode` instead of `makeaclitem`: the latter takes a list of
-- privileges only since Postgres 16, and the target may be older.
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
)
SELECT string_agg(name, ', ') FROM (VALUES
  -- narrowed
  ('users DELETE', has_table_privilege(:'role', 'public.users', 'DELETE')),
  ('users.role UPDATE', has_column_privilege(:'role', 'public.users', 'role', 'UPDATE')),
  ('audit_log UPDATE', has_table_privilege(:'role', 'public.audit_log', 'UPDATE')),
  ('audit_log DELETE', has_table_privilege(:'role', 'public.audit_log', 'DELETE')),
  ('_prisma_migrations SELECT', has_table_privilege(:'role', 'public._prisma_migrations', 'SELECT')),
  ('public CREATE', has_schema_privilege(:'role', 'public', 'CREATE')),
  ('guard_users_access EXECUTE', has_function_privilege(:'role', 'app_private.guard_users_access()', 'EXECUTE')),
  -- granted
  ('no users SELECT', NOT has_table_privilege(:'role', 'public.users', 'SELECT')),
  ('no users.last_login_at UPDATE', NOT has_column_privilege(:'role', 'public.users', 'last_login_at', 'UPDATE')),
  ('no audit_log INSERT', NOT has_table_privilege(:'role', 'public.audit_log', 'INSERT')),
  ('no transactions DELETE', NOT has_table_privilege(:'role', 'public.transactions', 'DELETE')),
  ('no public USAGE', NOT has_schema_privilege(:'role', 'public', 'USAGE')),
  ('no app_private USAGE', NOT has_schema_privilege(:'role', 'app_private', 'USAGE')),
  ('no set_user_access EXECUTE', NOT has_function_privilege(:'role',
    'app_private.set_user_access(bigint, public."UserStatus", public."UserRole", boolean)', 'EXECUTE')),
  ('no is_own_category EXECUTE', NOT has_function_privilege(:'role', 'app_private.is_own_category(bigint)', 'EXECUTE')),
  ('no auto_paid_owner_ids EXECUTE', NOT has_function_privilege(:'role', 'app_private.auto_paid_owner_ids()', 'EXECUTE')),
  ('a sequence without USAGE+SELECT', EXISTS (
    SELECT 1 FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'S'
      AND NOT (has_sequence_privilege(:'role', oid, 'USAGE') AND has_sequence_privilege(:'role', oid, 'SELECT')))),
  -- defaults for the next migration, owned by whoever owns the tables
  ('no default table privileges', (SELECT count(DISTINCT privilege) FROM defaults
    WHERE kind = 'r' AND privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')) <> 4),
  ('no default sequence privileges', (SELECT count(DISTINCT privilege) FROM defaults
    WHERE kind = 'S' AND privilege IN ('USAGE', 'SELECT')) <> 2)
) AS checks(name, wrong) WHERE wrong;
