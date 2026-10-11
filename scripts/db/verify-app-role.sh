#!/usr/bin/env bash
#
# Fails unless the privileges of `coco_app` are as the migrations left them:
# the checks of scripts/restore/check-app-role.sql (narrowed columns, grants,
# sequences, schemas, functions, forced row-level security with every policy,
# default privileges for the next table). restore.sh runs the same SQL after
# every restore; CI runs this after `db:test:push`, so a table born without
# its policy or a privilege a migration forgot to narrow is caught on the pull
# request and not in production (round 6, B3).
#
#   TEST_DATABASE_URL=postgresql://… bash scripts/db/verify-app-role.sh [NAME]
#
# NAME is the environment variable that holds the URL (TEST_DATABASE_URL by
# default), split into PG* variables by pg-env.mjs: no URL on any command line.
set -euo pipefail

cd "$(dirname "$0")/../.."
# shellcheck source=scripts/db/expected-policies.sh
. scripts/db/expected-policies.sh
URL_VAR="${1:-TEST_DATABASE_URL}"
[[ "$URL_VAR" =~ ^[A-Z_][A-Z0-9_]*$ ]] || { echo "Usage: verify-app-role.sh [NAME of the variable that holds the URL]" >&2; exit 1; }
APP_ROLE=coco_app

WRONG="$(
  eval "$(node scripts/db/pg-env.mjs "$URL_VAR")"
  psql -X -A -t -v ON_ERROR_STOP=1 -v role="$APP_ROLE" -v expected_policies="$EXPECTED_POLICIES" \
    -f scripts/restore/check-app-role.sql
)"
if [ -n "$WRONG" ]; then
  echo "FAIL: the privileges of $APP_ROLE are NOT as the migrations left them (scripts/restore/check-app-role.sql): $WRONG." >&2
  exit 1
fi
echo "The privileges of $APP_ROLE are as the migrations left them."
