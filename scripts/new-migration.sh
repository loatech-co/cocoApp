#!/usr/bin/env bash
#
# Creates a Prisma migration from the current state of schema.prisma.
#
# ── Why not `prisma migrate dev` ─────────────────────────────────────────────
# `migrate dev` demands an interactive TTY to ask for the migration name, and
# fails in any non-interactive run. This does the same in two explicit steps:
# generate the SQL with `migrate diff` and apply it with `migrate deploy`.
#
# The SQL is generated into a TEMPORARY file and the migration folder is
# created AFTERWARDS. The other way round, `migrate diff --from-migrations`
# would include the empty folder just created, produce an empty script, and
# `migrate deploy` would fail with P3006/P3018.
#
# ── What went away with Postgres ─────────────────────────────────────────────
# This script used to filter the phantom `MODIFY ... JSON` that MariaDB
# emitted on every diff, because there `JSON` was an alias of `longtext` and
# Prisma saw an unresolvable difference. Postgres has a real `jsonb`: the
# phantom no longer exists and the filter was removed.
#
# ── Where it is applied ──────────────────────────────────────────────────────
# Only to the LOCAL database (.env.migrate). Taking it to Supabase is a
# separate, deliberate step: scripts/deploy-migrations.sh
set -euo pipefail

NAME="${1:-}"
if [ -z "$NAME" ]; then
  echo "Usage: scripts/new-migration.sh <name_in_snake_case>" >&2
  exit 1
fi

cd "$(dirname "$0")/../api"

SQL=$(mktemp)
trap 'rm -f "$SQL"' EXIT

# Prisma 7: the throwaway database no longer goes by flag
# (`--shadow-database-url`): `prisma.config.ts` takes it from
# SHADOW_DATABASE_URL, which .env.migrate brings. And `--to-schema-datamodel`
# was renamed `--to-schema`.
grep -q '^SHADOW_DATABASE_URL=' .env.migrate || {
  echo "SHADOW_DATABASE_URL is missing from api/.env.migrate (see .env.migrate.example)." >&2
  exit 1
}

npx dotenv -e .env.migrate -- npx prisma migrate diff \
  --from-migrations ./prisma/migrations \
  --to-schema ./prisma/schema.prisma \
  --script > "$SQL"

if ! grep -qE '^(CREATE|ALTER|DROP|INSERT|UPDATE)' "$SQL"; then
  echo "Nothing to migrate: schema.prisma already matches the migrations."
  exit 0
fi

DIR="prisma/migrations/$(date +%Y%m%d%H%M%S)_${NAME}"
mkdir -p "$DIR"
cp "$SQL" "$DIR/migration.sql"

echo "→ $DIR/migration.sql"
cat "$DIR/migration.sql"
echo ""

npx dotenv -e .env.migrate -- npx prisma migrate deploy
npx prisma generate >/dev/null
echo "Done locally. To take it to Supabase: scripts/deploy-migrations.sh"
