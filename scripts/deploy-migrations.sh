#!/usr/bin/env bash
#
# Applies the pending migrations to Supabase (production).
#
#   bash scripts/deploy-migrations.sh [--backup <coco-*.tar.age>] [--dry-run] [--env-file <file>]
#
# ── Why this is a separate script and not the end of new-migration.sh ───────
# Because touching production has to be a deliberate act. Chaining it to the
# creation of the migration would let an exploratory `migrate diff` —the kind
# you run to SEE what would come out— end up altering the real database.
#
# ── Why it refuses without a fresh backup ────────────────────────────────────
# The stop table in CLAUDE.md puts a full backup, restore-tested, before any
# change that can lose data, and a migration can (a DROP, a TRUNCATE, a data
# fix gone wrong). Leaving it as a manual step in the runbook meant the script
# accepted a deploy without one. Now it looks for the newest
# `coco-*.tar.age` in $COCO_DATA_DIR/respaldos —or the one named with
# --backup— and stops unless it is younger than MAX_BACKUP_AGE_HOURS (24).
# That the restore was tested is still on whoever types `yes`: the script
# cannot see it.
#
# ── Why it fails on the counts ───────────────────────────────────────────────
# Closing the data API used to print three numbers for a human to read. A
# wrong number went by unnoticed; scripts/verify-data-api-closed.sh now exits
# 1 unless they are 0 / 0 / 14 / 0, FORCE ROW LEVEL SECURITY included.
#
# It goes through DIRECT_URL (session pooler, 5432): the transaction pooler
# does not support the statements of the migration engine. --env-file (a file
# in api/, `.env.supabase` by default) exists so the gates can be rehearsed
# against a local database; --dry-run stops before the confirmation.
set -euo pipefail

MAX_BACKUP_AGE_HOURS="${MAX_BACKUP_AGE_HOURS:-24}"
COCO_DATA_DIR="${COCO_DATA_DIR:-$HOME/Coding/VS Code/Personal/coco-datos}"
BACKUP=""
DRY_RUN=0
ENV_FILE=".env.supabase"

while [ $# -gt 0 ]; do
  case "$1" in
    --backup) BACKUP="${2:?--backup needs a file}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --env-file) ENV_FILE="${2:?--env-file needs a file}"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

cd "$(dirname "$0")/../api"

echo "▸ Current state in Supabase…"
# The gate is the exit code of `migrate status`, not whoever reads it: 0 means
# "up to date" and there is nothing to do here. Anything else is either
# pending migrations —the only thing that justifies going on— or something
# else (no connection, a half-failed migration), and then nothing is applied.
# The URL comes from `prisma.config.ts` (DIRECT_URL), which reads what dotenv
# injects.
if STATUS=$(npx dotenv -e "$ENV_FILE" -- npx prisma migrate status 2>&1); then
  echo "$STATUS"
  echo "No pending migrations. Nothing was touched."
  exit 0
fi
echo "$STATUS"
if ! grep -q 'have not yet been applied' <<<"$STATUS"; then
  echo "migrate status failed without listing pending migrations. Nothing is applied." >&2
  exit 1
fi

# ── The backup gate ─────────────────────────────────────────────────────────
echo ""
echo "▸ Backup…"
if [ -z "$BACKUP" ]; then
  BACKUP="$(ls -t "$COCO_DATA_DIR"/respaldos/coco-*.tar.age 2>/dev/null | head -1 || true)"
fi
if [ -z "$BACKUP" ] || [ ! -f "$BACKUP" ]; then
  echo "No backup found (${BACKUP:-$COCO_DATA_DIR/respaldos/coco-*.tar.age}). Nothing is applied." >&2
  echo "Run \`npm run backup\` and \`bash scripts/restore.sh\` first (CLAUDE.md, stop table)." >&2
  exit 1
fi
if [ -z "$(find "$BACKUP" -mmin "-$((MAX_BACKUP_AGE_HOURS * 60))" 2>/dev/null)" ]; then
  echo "The backup is older than ${MAX_BACKUP_AGE_HOURS} h: $BACKUP. Nothing is applied." >&2
  echo "Run \`npm run backup\` and \`bash scripts/restore.sh\` again." >&2
  exit 1
fi
echo "Backup younger than ${MAX_BACKUP_AGE_HOURS} h: $BACKUP"
echo "Its restore must have been tested just before (scripts/restore.sh): the script cannot check that."

if [ "$DRY_RUN" = 1 ]; then
  echo ""
  echo "Dry run: the gates pass. Nothing was touched."
  exit 0
fi

echo ""
read -r -p "Apply the pending migrations to PRODUCTION? (type 'yes') " ANSWER
if [ "$ANSWER" != "yes" ]; then
  echo "Cancelled. Nothing was touched."
  exit 0
fi

npx dotenv -e "$ENV_FILE" -- npx prisma migrate deploy

# ── Row-level security on NEW tables ─────────────────────────────────────────
# Supabase publishes the `public` schema as a REST API and grants `anon`
# access to every table that appears. A freshly migrated table is therefore
# born open to anyone holding the project's public key.
#
# `close-data-api.sql` undoes that and is idempotent, so it always runs: if
# there was nothing to close, it closes nothing. Then the counts are checked,
# and a wrong one is an error, not a line to read.
echo ""
echo "▸ Closing the data API over the new tables…"
cd ..
npm run --silent sql:supabase -- "$(cat scripts/close-data-api.sql)"
bash scripts/verify-data-api-closed.sh

echo "Done."
