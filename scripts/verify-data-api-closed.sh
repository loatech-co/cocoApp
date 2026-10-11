#!/usr/bin/env bash
#
# Fails unless the data API is closed: the four counts of
# scripts/check-data-api.sql come out as 0 / 0 / 14 / 0. deploy-migrations.sh
# runs it after every production migration; by hand it is the check of
# docs/runbook.md, "Migrations".
#
#   bash scripts/verify-data-api-closed.sh            # production, via the Management API
#   bash scripts/verify-data-api-closed.sh --local    # the local database (api/.env.migrate), via psql
#   bash scripts/verify-data-api-closed.sh --local NAME   # the database whose URL is in $NAME (CI)
#
# The expected number of policies is one per table (ADR 0024); it moves with
# the schema, so it is a variable and not a constant buried in the code.
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck source=scripts/db/expected-policies.sh
. scripts/db/expected-policies.sh
SQL="$(cat scripts/check-data-api.sql)"

LOCAL=0
if [ "${1:-}" = "--local" ]; then
  LOCAL=1
  # The URL goes to psql as PG* variables inside a subshell, never on its
  # command line: from api/.env.migrate, or from the variable NAMED as the
  # second argument (CI, after `db:test:push`; round 6, B3). Header, then the
  # one data row, then "(1 row)": the same shape as the Management API output
  # below, so one parser serves both.
  URL_VAR="${2:-LOCAL_URL}"
  [[ "$URL_VAR" =~ ^[A-Z_][A-Z0-9_]*$ ]] || { echo "--local takes the NAME of a variable, not a url." >&2; exit 1; }
  local_psql() {
    (
      if [ "$URL_VAR" = LOCAL_URL ]; then
        LOCAL_URL="$(sed -n 's/^DATABASE_URL=//p' api/.env.migrate | tr -d '"'"'"'')"
        eval "$(LOCAL_URL="$LOCAL_URL" node scripts/db/pg-env.mjs LOCAL_URL)"
      else
        eval "$(node scripts/db/pg-env.mjs "$URL_VAR")"
      fi
      psql -v ON_ERROR_STOP=1 -A -F ' ' -c "$1"
    )
  }
  OUTPUT="$(local_psql "$SQL")"
else
  OUTPUT="$(npm run --silent sql:supabase -- "$SQL")"
fi

read -r TABLES_WITHOUT_RLS OPEN_GRANTS POLICIES UNFORCED <<<"$(sed -n '2p' <<<"$OUTPUT")"
echo "tables_without_rls=${TABLES_WITHOUT_RLS:-?} open_grants=${OPEN_GRANTS:-?} policies=${POLICIES:-?} unforced=${UNFORCED:-?}"

# `_prisma_migrations` gets its row-level security (no policy, no FORCE) from
# close-data-api.sql, which runs only in production: locally and in CI that
# one table, and only that one, may show up without it.
if [ "$LOCAL" = 1 ] && [ "${TABLES_WITHOUT_RLS:-}" = 1 ]; then
  OPEN="$(local_psql "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity" | sed -n '2p')"
  [ "$OPEN" != _prisma_migrations ] || { echo "(_prisma_migrations without row-level security: close-data-api.sql never runs here)"; TABLES_WITHOUT_RLS=0; }
fi

FAILED=0
[ "${TABLES_WITHOUT_RLS:-}" = 0 ] || { echo "FAIL: ${TABLES_WITHOUT_RLS:-?} table(s) without row-level security." >&2; FAILED=1; }
[ "${OPEN_GRANTS:-}" = 0 ] || { echo "FAIL: ${OPEN_GRANTS:-?} grant(s) still held by anon/authenticated." >&2; FAILED=1; }
[ "${POLICIES:-}" = "$EXPECTED_POLICIES" ] || { echo "FAIL: ${POLICIES:-?} policies, expected $EXPECTED_POLICIES (EXPECTED_POLICIES)." >&2; FAILED=1; }
[ "${UNFORCED:-}" = 0 ] || { echo "FAIL: ${UNFORCED:-?} table(s) without FORCE ROW LEVEL SECURITY." >&2; FAILED=1; }

if [ "$FAILED" = 1 ]; then
  echo "The data API is NOT closed. Run scripts/close-data-api.sql and the RLS migration checks (docs/runbook.md, \"Migrations\")." >&2
  exit 1
fi
echo "The data API is closed."
