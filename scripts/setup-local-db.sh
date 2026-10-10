#!/usr/bin/env bash
#
# Prepares the LOCAL Postgres and the local env files for a fresh clone.
# Idempotent: run it again at any time; it only creates what is missing and
# never overwrites an env file that already exists.
#
#   bash scripts/setup-local-db.sh            # roles, databases, env files
#   bash scripts/setup-local-db.sh --clean    # also drops old coco_e2e_*_test databases
#
# What it does, in order:
#   1. `coco_migrate` (LOGIN, CREATEDB): owns the schema and runs migrations.
#   2. The databases coco_dev, coco_dev_shadow and coco_test, owned by it.
#   3. `coco_app`, the runtime role, through scripts/db/create-app-role.sh,
#      which also gives coco_migrate BYPASSRLS (local only).
#   4. api/.env.migrate, api/.env.test and frontend/.env from their templates,
#      and api/.env from api/.env.example with the local values filled in.
#
# The passwords are local-only, the same ones the templates carry, for a
# Postgres that listens on this machine. A role that already exists keeps its
# password: this never changes one under an env file that works.
#
# It connects as the local superuser: by default your OS user on 127.0.0.1:5432,
# which is what Homebrew's postgresql@17 creates. Set ADMIN_DATABASE_URL to use
# another; the env files it writes take that host and port.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADMIN_DATABASE_URL="${ADMIN_DATABASE_URL:-postgresql://$(id -un)@127.0.0.1:5432/postgres}"
MIGRATE_PASSWORD=local-only-migrate-password
APP_PASSWORD=local-only-coco-app-password

HOST=$(node -e 'console.log(new URL(process.argv[1]).hostname)' "$ADMIN_DATABASE_URL")
PORT=$(node -e 'console.log(new URL(process.argv[1]).port || 5432)' "$ADMIN_DATABASE_URL")
case "$HOST" in
  localhost | 127.0.0.1 | ::1) ;;
  *)
    echo "setup-local-db: this is for a local Postgres, not '$HOST'" >&2
    exit 1
    ;;
esac

psql_admin() { psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }
role_can_login() {
  [ "$(echo "SELECT count(*) FROM pg_roles WHERE rolname = :'r' AND rolcanlogin" |
    psql_admin -At -v r="$1")" = 1 ]
}

# ── 1. The migration role ───────────────────────────────────────────────────
# The password goes through the environment (\getenv), never on a command line.
if role_can_login coco_migrate; then
  echo "kept    role coco_migrate (already there, password unchanged: if it is not the one in api/.env.migrate, edit the env files)"
  psql_admin -c 'ALTER ROLE coco_migrate CREATEDB'
else
  export MIGRATE_PASSWORD
  psql_admin <<'SQL'
\getenv migrate_password MIGRATE_PASSWORD
SELECT 'CREATE ROLE coco_migrate' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'coco_migrate')
\gexec
ALTER ROLE coco_migrate WITH LOGIN CREATEDB PASSWORD :'migrate_password';
SQL
  echo "created role coco_migrate"
fi

# ── 2. The databases ────────────────────────────────────────────────────────
for db in coco_dev coco_dev_shadow coco_test; do
  echo "SELECT 'CREATE DATABASE ' || quote_ident(:'db') || ' OWNER coco_migrate'
        WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db')
        \\gexec" | psql_admin -v db="$db"
done

# ── 3. The runtime role ─────────────────────────────────────────────────────
if role_can_login coco_app; then
  echo "kept    role coco_app (already there, password unchanged: if it is not the one in api/.env, edit the env files)"
  psql_admin -c 'ALTER ROLE coco_migrate BYPASSRLS'
else
  ADMIN_DATABASE_URL="$ADMIN_DATABASE_URL" COCO_APP_DB_PASSWORD="$APP_PASSWORD" \
    MIGRATION_ROLE=coco_migrate bash "$ROOT/scripts/db/create-app-role.sh" >/dev/null
  echo "created role coco_app"
fi

# ── 4. The env files ────────────────────────────────────────────────────────
copy_if_missing() {
  if [ -e "$ROOT/$2" ]; then
    echo "kept    $2 (already there)"
  else
    sed "s/127\.0\.0\.1:5432/$HOST:$PORT/g" "$ROOT/$1" >"$ROOT/$2"
    echo "created $2"
  fi
}
copy_if_missing api/.env.migrate.example api/.env.migrate
copy_if_missing api/.env.test.example api/.env.test
copy_if_missing frontend/.env.example frontend/.env

if [ -e "$ROOT/api/.env" ]; then
  echo "kept    api/.env (already there)"
else
  # api/.env.example lists every variable empty; these are the ones a local
  # run needs. SUPABASE_URL is the local auth server (`npm run dev:auth`),
  # never the production project.
  node - "$ROOT/api/.env.example" "$ROOT/api/.env" "$MIGRATE_PASSWORD" "$APP_PASSWORD" "$HOST:$PORT" <<'NODE'
const { readFileSync, writeFileSync } = require('node:fs');
const [example, target, migratePassword, appPassword, server] = process.argv.slice(2);
const local = {
  NODE_ENV: 'development',
  PORT: '3000',
  LOG_LEVEL: 'log',
  DATABASE_URL: `"postgresql://coco_app:${appPassword}@${server}/coco_dev"`,
  DIRECT_URL: `"postgresql://coco_migrate:${migratePassword}@${server}/coco_dev"`,
  SUPABASE_URL: 'http://127.0.0.1:9999',
  SUPABASE_ANON_KEY: 'local-dev-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'local-dev-service-key',
  BOOTSTRAP_ADMIN_EMAIL: 'admin@local.coco',
  CHECK_BREACHED_PASSWORDS: 'false',
  CORS_ORIGINS: 'http://localhost:5173',
};
const text = readFileSync(example, 'utf8').replace(/^([A-Z_]+)=$/gm, (line, key) =>
  key in local ? `${key}=${local[key]}` : line,
);
writeFileSync(target, text, { mode: 0o600 });
NODE
  echo "created api/.env"
fi

# ── Optional: old journey databases ─────────────────────────────────────────
if [ "${1:-}" = "--clean" ]; then
  psql_admin -At -c "SELECT datname FROM pg_database WHERE datname LIKE 'coco\_e2e\_%\_test'" |
    while read -r db; do
      [ -n "$db" ] || continue
      echo "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE);" | psql_admin
      echo "dropped $db"
    done
fi

echo "setup-local-db: ready. Next: npm run prisma:migrate:dev --workspace api"
