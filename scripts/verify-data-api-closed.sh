#!/usr/bin/env bash
#
# Fails unless the data API is closed: the four counts of
# scripts/check-data-api.sql come out as 0 / 0 / 14 / 0. deploy-migrations.sh
# runs it after every production migration; by hand it is the check of
# docs/runbook.md, "Migrations".
#
#   bash scripts/verify-data-api-closed.sh            # production, via the Management API
#   bash scripts/verify-data-api-closed.sh --local    # the local database, via psql
#
# The expected number of policies is one per table (ADR 0024); it moves with
# the schema, so it is a variable and not a constant buried in the code.
set -euo pipefail

cd "$(dirname "$0")/.."
EXPECTED_POLICIES="${EXPECTED_POLICIES:-14}"
SQL="$(cat scripts/check-data-api.sql)"

if [ "${1:-}" = "--local" ]; then
  URL="$(sed -n 's/^DATABASE_URL=//p' api/.env.migrate | tr -d '"'"'"'')"
  # Header, then the one data row, then "(1 row)": the same shape as the
  # Management API output below, so one parser serves both.
  OUTPUT="$(psql "$URL" -v ON_ERROR_STOP=1 -A -F ' ' -c "$SQL")"
else
  OUTPUT="$(npm run --silent sql:supabase -- "$SQL")"
fi

read -r TABLES_WITHOUT_RLS OPEN_GRANTS POLICIES UNFORCED <<<"$(sed -n '2p' <<<"$OUTPUT")"
echo "tables_without_rls=${TABLES_WITHOUT_RLS:-?} open_grants=${OPEN_GRANTS:-?} policies=${POLICIES:-?} unforced=${UNFORCED:-?}"

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
