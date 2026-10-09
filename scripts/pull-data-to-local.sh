#!/usr/bin/env bash
#
# Copies the DATA from Supabase to the local database, to work without
# touching production.
#
# ── Why it exists ────────────────────────────────────────────────────────────
# Developing against Supabase means every test —create a transaction,
# reclassify a row, delete a category— changes real data. And developing
# against an empty database means half the screens look like an empty state
# and errors in real data do not show up until the deploy.
#
# ── What it does NOT copy ────────────────────────────────────────────────────
# The schema. Prisma sets that with the migrations, which are the source of
# truth; copying it from the live database would leave the local one out of
# sync with the repository without anyone noticing.
#
# Nor does it copy Supabase's `auth.users`: the credentials live there and the
# local API talks to the same GoTrue. You sign in with the same email and
# password.
set -euo pipefail

cd "$(dirname "$0")/.."

# The session URL (5432), not the transaction one (6543): pg_dump needs a
# stable session and the pooler in transaction mode cuts it halfway.
SOURCE=$(grep '^DIRECT_URL=' api/.env.supabase | sed 's/^DIRECT_URL=//; s/^"//; s/"$//; s/^'"'"'//; s/'"'"'$//')
# As the OWNER (DIRECT_URL): since step 7.11-b the API connects as
# `coco_app`, which can neither truncate tables nor see everyone's rows.
TARGET=$(grep '^DIRECT_URL=' api/.env | sed 's/^DIRECT_URL=//; s/^"//; s/"$//; s/^'"'"'//; s/'"'"'$//')

[ -n "$SOURCE" ] || { echo "DIRECT_URL not found in api/.env.supabase" >&2; exit 1; }
[ -n "$TARGET" ] || { echo "DIRECT_URL not found in api/.env" >&2; exit 1; }

case "$TARGET" in
  *localhost*|*127.0.0.1*) ;;
  # This script WIPES the target before writing. If the target is not local,
  # something is misconfigured and it is not worth finding out what.
  *) echo "The target is not local. Nothing was touched." >&2; exit 1 ;;
esac

# IN DEPENDENCY ORDER, and that order matters.
#
# `pg_dump --data-only` dumps tables alphabetically, not by dependency:
# `accounts` comes before `users` and its foreign key does not find the user.
# The usual way out is `--disable-triggers`, but that requires a superuser on
# the target and the local database is not one. So it dumps table by table
# and restores in the right order.
TABLES=(
  users
  accounts
  categories
  tags
  import_batches
  transactions
  transaction_splits
  transaction_tags
  import_rows
  category_rules
  user_preferences
  audit_log
)

LIST=$(IFS=,; echo "${TABLES[*]}")

echo "▸ Emptying the local database…"
psql "$TARGET" -q -c "TRUNCATE $LIST RESTART IDENTITY CASCADE;"

echo "▸ Pulling the data from Supabase…"
DUMP=$(mktemp -t coco-data)
trap 'rm -f "$DUMP"' EXIT

for t in "${TABLES[@]}"; do
  pg_dump "$SOURCE" --data-only --no-owner --no-privileges --table="public.$t" >> "$DUMP"
done

# A single transaction: if something fails halfway, the local database is
# left empty rather than half-full, which is worse than empty because it
# looks like it worked.
psql "$TARGET" -q --single-transaction -v ON_ERROR_STOP=1 -f "$DUMP"

echo "▸ Checking…"
psql "$TARGET" -q -c "
  SELECT 'transactions' AS table_name, count(*) FROM transactions
  UNION ALL SELECT 'categories', count(*) FROM categories
  UNION ALL SELECT 'users', count(*) FROM users;"

echo "Done. The local API now has the same data as production."
