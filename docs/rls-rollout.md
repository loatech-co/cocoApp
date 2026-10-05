# Row-level security — production rollout (step 7.11-b)

> Working document. It moves into `docs/runbook.md` (PR #19) when both are in
> `Dev`, and is deleted here. Design and numbers: ADR 0019.

The director runs this when integrating, not the executor. Every step can be
undone on its own, and the API keeps working between any two of them.

**Status: steps 1–5 are ready. Steps 6–7 (activation) wait for the cost
decision in ADR 0019** — the full-range dashboard p95 with RLS was over the
50 ms budget locally. Until then production keeps `DATABASE_URL` on the owner
and the policies are inert.

Conventions: commands run from the repository root on the owner's machine.
`$SSH` is the line `desplegar-api.sh` uses
(`ssh -i ~/.ssh/hostinger_cocoapp -p <port> <user>@<host>`); `$CONFIG` is
`~/domains/dev-cocoapp.viteri.me/hbuilds/config`. Nothing below prints a
password: the ones that are typed go through the environment.

## 1. Verified backup

```bash
bash scripts/respaldar.sh
```

It dumps, restores into a throwaway local database and counts rows; if that
last step fails, stop. **Undo:** nothing to undo.

## 2. Gate: the owner keeps `BYPASSRLS`

The FORCE migration binds the tables' owner to the policies. In Supabase the
owner is `postgres`, which must have `BYPASSRLS` (0007 says it does; check):

```bash
npm run sql:supabase -- "SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = 'postgres'"
```

`rolbypassrls` must be `t`. **If it is `f`, stop**: with FORCE, the API —still
connected as `postgres`— would see no rows at all. **Undo:** read-only.

## 3. Create `coco_app` with its password

Generate a password (32 characters, no symbols that break a URL) and keep it
in the password manager before using it:

```bash
export COCO_APP_DB_PASSWORD="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c1-32)"
export ADMIN_DATABASE_URL="$(grep '^DIRECT_URL=' api/.env.supabase | sed 's/^DIRECT_URL=//; s/^"//; s/"$//')"
bash scripts/db/create-app-role.sh      # NO MIGRATION_ROLE in production
unset COCO_APP_DB_PASSWORD ADMIN_DATABASE_URL
```

Expected output: `coco_app login=true bypassrls=false`. Idempotent: running it
again only rotates the password. **Undo** (only before step 4; it is a
deletion, ask first): `DROP ROLE coco_app;`

## 4. Migrations

```bash
bash scripts/desplegar-migraciones.sh
```

(or the programmatic gate in force at the time). Applies
`20261006000000_add_row_level_security` and
`20261006000100_force_row_level_security`. Nothing changes for the API: it
connects as `postgres`, which bypasses the policies.

Verify with the data-API script's check
(`scripts/cerrar-el-api-de-datos.sql`): `tablas_sin_seguridad = 0`,
`permisos_abiertos = 0`, `politicas = 14`. And the definer function:

```bash
npm run sql:supabase -- "SELECT count(*) FROM app_private.auto_paid_owner_ids()"
```

**Undo** (deletes structure: ask first). Run as the owner:

```sql
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;
DROP SCHEMA app_private CASCADE;
DELETE FROM _prisma_migrations
 WHERE migration_name IN ('20261006000000_add_row_level_security',
                          '20261006000100_force_row_level_security');
```

RLS stays ENABLED (0007 turned it on before this step), so the tables are
exactly as they were.

## 5. Deploy the code that uses `forUser`

```bash
bash scripts/desplegar-api.sh
```

It behaves the same as owner: `set_config` is set and nobody reads it. Verify
in production: `GET /api/v1/health` 200, `GET /api/v1/ready` 200, a real login
of the owner, the dashboard shows data, and a test movement created and
deleted. **Undo:** redeploy the previous version (runbook, "Roll back").

---

**Steps 6–7 wait for ADR 0019's decision.**

## 6. Switch `DATABASE_URL` to `coco_app`

Keep the current value first, readable only by the account:

```bash
$SSH 'cd ~/domains/dev-cocoapp.viteri.me/hbuilds/config && umask 077 && cp .env .env.before-rls && chmod 600 .env.before-rls'
```

Then edit `DATABASE_URL` in `$CONFIG/.env` (on the server, with an editor;
the password is not passed on a command line). Same host, port (6543), and
query parameters as the old value; only the user and password change. Through
Supavisor the user carries the project reference:

```
postgresql://coco_app.<project-ref>:<password>@<pooler-host>:6543/postgres?<same parameters as before>
```

`DIRECT_URL` does not change: migrations stay with the owner.

Restart and verify:

```bash
$SSH 'touch ~/domains/dev-cocoapp.viteri.me/hbuilds/current/nodejs/tmp/restart.txt'
```

1. `GET /api/v1/ready` → 200 (`coco_app` can connect).
2. A real login of the owner, and the dashboard shows THEIR data. An empty
   dashboard means the setting is not reaching the policies: undo at once.
3. A test movement: create it, see it in the list, delete it.
4. The admin log opens (only for an active admin).
5. Next morning, `~/logs/coco-api/api.log` has the `Auto-charge run` line
   with the usual number of users.

**Undo:** `$SSH 'cd ~/domains/dev-cocoapp.viteri.me/hbuilds/config && cp .env.before-rls .env'` and the same
restart. After a week without incidents, delete `.env.before-rls` (ask).

## 7. FORCE, last

The FORCE migration was already applied in step 4; it is listed here because
it is the last thing that matters. It does nothing to `coco_app` (not the
owner) or to `postgres` (`BYPASSRLS`, step 2). Verify:

```bash
npm run sql:supabase -- "SELECT count(*) FILTER (WHERE NOT relforcerowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'"
```

→ `0`. **Undo:** `ALTER TABLE public.<table> NO FORCE ROW LEVEL SECURITY;`
for each table (the first block of step 4's undo).

## Local and CI

- Local, once per machine: `ADMIN_DATABASE_URL=postgresql://localhost:5432/postgres
COCO_APP_DB_PASSWORD=<local, ≥16> MIGRATION_ROLE=coco_migrate bash scripts/db/create-app-role.sh`.
  Then `api/.env` and `api/.env.test`: `DATABASE_URL` as `coco_app`,
  `DIRECT_URL` as `coco_migrate`.
- `scripts/traer-datos-a-local.sh` now writes through `DIRECT_URL`.
- A `pg_dump` with the policies restores only where `coco_app` exists.
- CI creates the role in the Postgres service before migrating
  (`.github/workflows/ci.yml`) and runs the API as `coco_app`.
