#!/usr/bin/env bash
#
# Applies the pending migrations to Supabase (production).
#
# ── Why this is a separate script and not the end of new-migration.sh ───────
# Because touching production has to be a deliberate act. Chaining it to the
# creation of the migration would let an exploratory `migrate diff` —the kind
# you run to SEE what would come out— end up altering the real database.
#
# It goes through DIRECT_URL (session pooler, 5432): the transaction pooler
# does not support the statements of the migration engine.
set -euo pipefail

cd "$(dirname "$0")/../api"

echo "▸ Current state in Supabase…"
# The gate is the exit code of `migrate status`, not whoever reads it: 0 means
# "up to date" and there is nothing to do here. Anything else is either
# pending migrations —the only thing that justifies going on— or something
# else (no connection, a half-failed migration), and then nothing is applied.
# The URL comes from `prisma.config.ts` (DIRECT_URL), which reads what dotenv
# injects.
if STATUS=$(npx dotenv -e .env.supabase -- npx prisma migrate status 2>&1); then
  echo "$STATUS"
  echo "No pending migrations. Nothing was touched."
  exit 0
fi
echo "$STATUS"
if ! grep -q 'have not yet been applied' <<<"$STATUS"; then
  echo "migrate status failed without listing pending migrations. Nothing is applied." >&2
  exit 1
fi

echo ""
read -r -p "Apply the pending migrations to PRODUCTION? (type 'yes') " ANSWER
if [ "$ANSWER" != "yes" ]; then
  echo "Cancelled. Nothing was touched."
  exit 0
fi

npx dotenv -e .env.supabase -- npx prisma migrate deploy

# ── Row-level security on NEW tables ─────────────────────────────────────────
# Supabase publishes the `public` schema as a REST API and grants `anon`
# access to every table that appears. A freshly migrated table is therefore
# born open to anyone holding the project's public key.
#
# `close-data-api.sql` undoes that and is idempotent, so it always runs: if
# there was nothing to close, it closes nothing.
echo ""
echo "▸ Closing the data API over the new tables…"
cd ..
npm run --silent sql:supabase -- "$(cat scripts/close-data-api.sql)"

echo "Done."
