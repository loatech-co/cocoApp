#!/usr/bin/env bash
#
# Creates (or updates) `coco_app`, the role the API connects as. Idempotent:
# run it again to rotate the password. ADR 0019 and 0024; docs/runbook.md, "Row-level security".
#
#   ADMIN_DATABASE_URL=postgresql://<a role that can create roles>@host/db \
#   COCO_APP_DB_PASSWORD=... \
#   bash scripts/db/create-app-role.sh
#
#   # local and CI only: also give the migration role BYPASSRLS
#   MIGRATION_ROLE=coco_migrate ... bash scripts/db/create-app-role.sh
#
# ── Why a script and not a migration ────────────────────────────────────────
# A LOGIN role needs a password, and passwords are not versioned. The
# migration 20261006000000_add_row_level_security only makes sure a NOLOGIN
# `coco_app` exists and grants it what it needs; this gives it LOGIN and its
# password. Run it BEFORE the migrations.
#
# ── What the role is ────────────────────────────────────────────────────────
# LOGIN, NOBYPASSRLS, not a superuser, cannot create databases or roles, and
# NOINHERIT so membership in another role never hands it a bypass. Its table
# privileges (SELECT/INSERT/UPDATE/DELETE, sequences) come from the migration.
#
# ── MIGRATION_ROLE (local and CI only) ──────────────────────────────────────
# FORCE ROW LEVEL SECURITY makes the policies apply to the tables' owner. In
# Supabase the owner is `postgres`, which already has BYPASSRLS. Locally the
# owner is `coco_migrate`, which does not: without it, the e2e suites' setup,
# the local scripts and any data fix in a migration would see zero rows.
# Refused for a remote host: production's owner is not ours to alter.
#
# SUPERUSER, REPLICATION and BYPASSRLS are not named in the ALTER: since
# PostgreSQL 16 only a superuser may name them, even to say NO, and Supabase's
# `postgres` is not one (it failed there with "permission denied to alter
# role"). A new role is born without them, and the script checks that it
# still is.
#
# ── Supabase ────────────────────────────────────────────────────────────────
# Through the pooler (Supavisor) the user is `<role>.<project-ref>`:
#   postgresql://coco_app.<project-ref>:<password>@<pooler-host>:6543/postgres
# The same role over the direct host is just `coco_app`.
#
# Neither the password nor ADMIN_DATABASE_URL (it carries one) go on a
# command line, where `ps` shows them to every process on the machine: psql
# reads the password from the environment with \getenv (psql 15+), and the
# connection as the PG* variables libpq reads, split here from the URL by a
# node that reads it from its own environment.
set -euo pipefail

: "${ADMIN_DATABASE_URL:?ADMIN_DATABASE_URL is required (a role that can create roles)}"
: "${COCO_APP_DB_PASSWORD:?COCO_APP_DB_PASSWORD is required}"

if [ "${#COCO_APP_DB_PASSWORD}" -lt 16 ]; then
  echo "create-app-role: the password must be at least 16 characters" >&2
  exit 1
fi

export COCO_APP_DB_PASSWORD

# shellcheck disable=SC2016 # the single-quoted program runs in node, not in bash.
eval "$(node -e '
  const u = new URL(process.env.ADMIN_DATABASE_URL);
  const quoted = (s) => "\x27" + s.replace(/\x27/g, "\x27\\\x27\x27") + "\x27";
  const vars = {
    PGHOST: u.hostname.replace(/^\[|\]$/g, ""),
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
  };
  const ssl = u.searchParams.get("sslmode");
  if (ssl) vars.PGSSLMODE = ssl;
  console.log(Object.entries(vars).map(([k, v]) => `export ${k}=${quoted(v)}`).join("\n"));
')"

psql -v ON_ERROR_STOP=1 -q <<'SQL'
\getenv app_password COCO_APP_DB_PASSWORD
SELECT 'CREATE ROLE coco_app' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'coco_app')
\gexec
ALTER ROLE coco_app WITH LOGIN NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD :'app_password';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'coco_app'
             AND (rolsuper OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'coco_app must not be a superuser, replicate or bypass row security';
  END IF;
END $$;
SQL

if [ -n "${MIGRATION_ROLE:-}" ]; then
  case "$PGHOST" in
    localhost | 127.0.0.1 | ::1 | '') ;;
    *)
      echo "create-app-role: MIGRATION_ROLE is for a local database, not '$PGHOST'" >&2
      exit 1
      ;;
  esac
  # Through stdin, not -c: psql does not interpolate variables in -c.
  echo 'ALTER ROLE :"role" BYPASSRLS;' |
    psql -v ON_ERROR_STOP=1 -q -v role="$MIGRATION_ROLE"
fi

echo "SELECT rolname, 'login=' || rolcanlogin, 'bypassrls=' || rolbypassrls
      FROM pg_roles WHERE rolname IN ('coco_app', current_user, :'role') ORDER BY rolname;" |
  psql -v ON_ERROR_STOP=1 -At -F ' ' -v role="${MIGRATION_ROLE:-coco_app}"
