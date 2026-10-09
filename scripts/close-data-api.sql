-- Closes Supabase's data API over the `public` schema.
--
-- Applied with:
--   npm run sql:supabase -- "$(cat scripts/close-data-api.sql)"
--
-- It is idempotent: it can be run again as many times as needed, and it has
-- to be after every migration that adds a table.
--
-- ── The problem it solves ────────────────────────────────────────────────────
-- Supabase is not just a hosted Postgres: it also publishes the whole `public`
-- schema as a REST API at https://<ref>.supabase.co/rest/v1/, and grants the
-- `anon` and `authenticated` roles access to every table that is created.
--
-- The only thing between that door and the content is row-level security.
-- Without it, anyone holding the project's `anon` key can read the whole
-- database —and empty it— without going through Coco's API. And the `anon`
-- key is NOT a secret: Supabase's model hands it to browsers on purpose, and
-- assumes row-level security is what protects the data.
--
-- The dashboard advisor reported it as CRITICAL on all fourteen tables, and it
-- was right: `anon` had SELECT, INSERT, UPDATE, DELETE and TRUNCATE on all of
-- them, `users` and `audit_log` included.
--
-- ── Why it breaks nothing ────────────────────────────────────────────────────
-- Because Coco never uses that door. The frontend carries no Supabase client
-- and no key —it only talks to its own API, through `/api/v2`— and the API
-- connects over the wire with Prisma, as the `postgres` role, which OWNS the
-- fourteen tables and also has `rolbypassrls`. A policy that does not exist
-- does not affect it: a table owner bypasses row-level security unless FORCE
-- is declared, and it is not declared here.
--
-- ── Why it is not a Prisma migration ─────────────────────────────────────────
-- Because migrations also run against the local Postgres, where the `anon`
-- and `authenticated` roles do not exist: the REVOKE would fail and leave the
-- development environment unable to migrate. This is hosting configuration,
-- not database structure, and that is why it lives here.

-- ── 1. Row-level security on everything there is, without a single policy ───
-- Without a policy nobody gets through. It walks `pg_tables` instead of
-- listing the fourteen by hand so that a new table is not left out by
-- oversight the day someone runs this again.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- ── 2. And no grants left to exercise ───────────────────────────────────────
-- Row-level security would be enough. This is the second lock: if someone
-- ever adds a policy with something else in mind, the grants are not there
-- and the door stays shut.
--
-- `service_role` stays as it is: it can only be used with the project's
-- secret key —which never leaves here— and it bypasses row-level security
-- anyway.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- ── 3. So FUTURE tables are not born open either ────────────────────────────
-- Supabase grants the permissions above with an ALTER DEFAULT PRIVILEGES on
-- behalf of `postgres`. Without turning it off, the next migration would
-- create a table with the same grants just removed.
--
-- Careful: this does NOT enable row-level security on new tables. That cannot
-- be made automatic, so part 1 has to be run again after every migration that
-- adds a table.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- ── Check ───────────────────────────────────────────────────────────────────
-- `tables_without_rls` and `open_grants` must come out as zero. Since step
-- 7.11-b `policies` comes out as 14, all of them `TO coco_app`: the role the
-- API connects as (ADR 0019). None names `anon` or `authenticated`, so for
-- them there is still no policy, same as before.
SELECT
  count(*) FILTER (WHERE NOT rowsecurity) AS tables_without_rls,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public') AS policies,
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')) AS open_grants
FROM pg_tables
WHERE schemaname = 'public';
