#!/usr/bin/env bash
#
# Runs SQL against Supabase's Postgres.
#
# ── Why through the Management API and not a direct connection ───────────────
# Because it does not need the database password. It is the same endpoint the
# dashboard's SQL editor uses: it authenticates with the Personal Access
# Token, which is already in .env.migrate. The Postgres password is still
# needed for what connects over the wire —Prisma and the API— but not to
# inspect or fix things from here.
#
# The token is NOT passed on the command line: `dotenv` injects it into the
# environment and the process itself expands it, because arguments are
# visible in `ps` to any other process on the machine.
set -euo pipefail

PROJECT="${SUPABASE_PROJECT_REF:-yocafgrrbtmldygjxkva}"

SQL="${1:-}"
if [ -z "$SQL" ]; then
  echo 'Usage: npm run sql:supabase -- "SELECT ..."' >&2
  exit 1
fi

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "SUPABASE_ACCESS_TOKEN is missing. Run this with: npm run sql:supabase -- \"...\"" >&2
  exit 1
fi

# jq builds the JSON: the SQL may carry quotes, line breaks and backslashes,
# and building the body by hand would break them.
BODY=$(jq -n --arg q "$SQL" '{query: $q}')

RESPONSE=$(curl -s -X POST \
  "https://api.supabase.com/v1/projects/${PROJECT}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$BODY" --max-time 60)

# An API error arrives as an object with "message"; a result, as a list.
if echo "$RESPONSE" | jq -e 'type == "object" and has("message")' >/dev/null 2>&1; then
  echo "Error: $(echo "$RESPONSE" | jq -r '.message')" >&2
  exit 1
fi

if [ "$(echo "$RESPONSE" | jq 'length')" = "0" ]; then
  echo "(no rows)"
else
  echo "$RESPONSE" | jq -r '(.[0] | keys_unsorted) as $k
    | ($k | @tsv), (.[] | [$k[] as $c | .[$c] | tostring] | @tsv)' \
    | column -t -s $'\t'
  echo "$(echo "$RESPONSE" | jq 'length') row(s)"
fi
