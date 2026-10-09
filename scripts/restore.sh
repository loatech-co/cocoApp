#!/usr/bin/env bash
#
# Restores a backup made by backup.sh and proves it came back whole: it counts
# the rows of every table in `public` and `auth` and compares them with the
# ones the manifest wrote down at backup time, and checks the sha256 of every
# file of the bucket.
#
# Usage:
#   bash scripts/restore.sh [backup]
#       Without --target it restores into a throwaway LOCAL database
#       (coco_restore_test, or $COCO_RESTORE_DB, which must end in
#       _restore_test), compares and drops it. `backup` is a
#       coco-<date>.tar.age or an already decrypted folder; by default, the
#       newest one in $COCO_DATA_DIR/respaldos.
#
#   bash scripts/restore.sh [backup] --target <url> [--i-know-this-is-production]
#       Restores into another database. It asks you to type the name of the
#       target database, letter by letter. With production it refuses unless
#       --i-know-this-is-production is passed as well. Restoring into
#       production is an owner STOP (docs/runbook.md).
#
#       If the target is a Supabase, `auth` goes data-only (the schema belongs
#       to Supabase and already exists) and has to be empty: this is for a new
#       project. The bucket is not uploaded from here: the backup is decrypted
#       by hand (docs/runbook.md) and uploaded with
#       scripts/receipts/copy-to-storage.mjs.
#
# The names inside a backup (`conteos.tsv`, `sumas.sha256`, `soportes/`) are
# a stored format and stay as they are: every backup already on disk has them.
set -euo pipefail

cd "$(dirname "$0")/.."

COCO_DATA_DIR="${COCO_DATA_DIR:-$HOME/Documents/VS Code/Personal/coco-datos}"
PRIVATE_KEY="${COCO_BACKUP_KEY:-${COCO_KEYS_DIR:-$HOME/.config/coco}/respaldo.key}"
ENV_FILE="${COCO_ENV_FILE:-api/.env.supabase}"
LOCAL_DB="${COCO_RESTORE_DB:-coco_restore_test}"

export PATH="/opt/homebrew/opt/postgresql@17/bin:/opt/homebrew/opt/libpq/bin:$PATH"

stop() {
  echo "$1" >&2
  exit 1
}

BACKUP=""
TARGET=""
PRODUCTION_ACCEPTED=0
while [ $# -gt 0 ]; do
  case "$1" in
    --target)
      [ $# -ge 2 ] || stop "--target needs a url."
      TARGET="$2"
      shift 2
      ;;
    --i-know-this-is-production)
      PRODUCTION_ACCEPTED=1
      shift
      ;;
    -*) stop "Unknown option: $1" ;;
    *)
      BACKUP="$1"
      shift
      ;;
  esac
done

if [ -z "$BACKUP" ]; then
  # The name carries the date: the last one in alphabetical order is the newest.
  BACKUP="$(find "$COCO_DATA_DIR/respaldos" -maxdepth 1 -name 'coco-*.tar.age' | sort | tail -1)"
  [ -n "$BACKUP" ] || stop "There is no coco-*.tar.age in $COCO_DATA_DIR/respaldos."
fi

# ── 1. The target, before opening anything ───────────────────────────────────
database_name() { sed -E 's#^[a-z]+://[^/]*/([^?]*).*#\1#' <<<"$1"; }

IS_SUPABASE=0
if [ -z "$TARGET" ]; then
  [[ "$LOCAL_DB" == *_restore_test ]] || stop "The local database must end in _restore_test (it is: $LOCAL_DB)."
  CONNECTION="$LOCAL_DB"
else
  DB="$(database_name "$TARGET")"
  [ -n "$DB" ] || stop "Could not read the database name from the --target url."
  [[ "$TARGET" == *supabase* ]] && IS_SUPABASE=1

  # Production is the one with the ref of api/.env.supabase. Without that
  # file there is no way to tell, so every Supabase counts as production.
  REF=""
  [ -f "$ENV_FILE" ] &&
    REF="$(grep -E '^SUPABASE_URL=' "$ENV_FILE" | sed -E 's#^[^/]*//([^.]+)\..*#\1#')"
  if { [ -n "$REF" ] && [[ "$TARGET" == *"$REF"* ]]; } || { [ -z "$REF" ] && [ $IS_SUPABASE = 1 ]; }; then
    [ $PRODUCTION_ACCEPTED = 1 ] ||
      stop "The target is PRODUCTION. Restoring there is an owner stop; if it is one, add --i-know-this-is-production."
    echo "⚠️  You are about to OVERWRITE PRODUCTION." >&2
  fi

  read -r -p "Type the name of the target database ($DB) to confirm: " CONFIRMATION </dev/tty
  [ "$CONFIRMATION" = "$DB" ] || stop "It does not match. Nothing was restored."
  CONNECTION="$TARGET"
fi

# ── 2. Open the backup ───────────────────────────────────────────────────────
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/coco-restore.XXXXXX")"
chmod 700 "$WORKDIR"
# Cleans up and keeps the exit status: bash 3.2 (the one macOS ships) can
# otherwise exit 0 after a failure when an EXIT trap runs.
cleanup() {
  local status=$?
  rm -rf "$WORKDIR"
  exit "$status"
}
trap cleanup EXIT

if [ -d "$BACKUP" ]; then
  FOLDER="$BACKUP"
else
  command -v age >/dev/null || stop "age is missing. Install it with: brew install age"
  [ -f "$PRIVATE_KEY" ] || stop "The private key is missing at $PRIVATE_KEY (docs/runbook.md says where the copy is)."
  echo "▸ Decrypting $(basename "$BACKUP")…"
  age -d -i "$PRIVATE_KEY" "$BACKUP" | tar -C "$WORKDIR" -xf -
  FOLDER="$(find "$WORKDIR" -mindepth 1 -maxdepth 1 -type d | head -1)"
fi
for piece in manifest.json conteos.tsv db.dump sumas.sha256; do
  [ -f "$FOLDER/$piece" ] || stop "The backup has no $piece: it is not a full backup."
done

# ── 3. The bucket files ──────────────────────────────────────────────────────
echo "▸ Checking the sha256 of the bucket files…"
FILES=$(wc -l <"$FOLDER/sumas.sha256" | tr -d ' ')
if [ "$FILES" -gt 0 ]; then
  (cd "$FOLDER" && shasum -a 256 -c --quiet sumas.sha256) ||
    stop "Some bucket files are damaged or missing."
fi
echo "   $FILES files intact"

# ── 4. Restore ───────────────────────────────────────────────────────────────
if [ -z "$TARGET" ]; then
  echo "▸ Restoring into the throwaway local database ${LOCAL_DB}…"
  dropdb --if-exists "$LOCAL_DB"
  createdb "$LOCAL_DB"
else
  echo "▸ Restoring into ${DB}…"
fi
START=$SECONDS
# --clean on a freshly created database too: since Postgres 15 every database
# is born with a `public` schema, and the dump's CREATE SCHEMA would clash
# with it.
PG_RESTORE=(pg_restore --no-owner --no-privileges --exit-on-error -d "$CONNECTION")
if [ -n "$TARGET" ] && [ $IS_SUPABASE = 1 ]; then
  "${PG_RESTORE[@]}" --schema=auth --data-only "$FOLDER/db.dump"
  # app_private first: the policies of `public` call its functions.
  "${PG_RESTORE[@]}" --schema=app_private --schema=public --clean --if-exists "$FOLDER/db.dump"
else
  "${PG_RESTORE[@]}" --clean --if-exists "$FOLDER/db.dump"
fi
echo "   restored in $((SECONDS - START)) s"

# ── 5. Count ─────────────────────────────────────────────────────────────────
echo "▸ Counting rows…"
psql -X -q -A -t -F $'\t' -v ON_ERROR_STOP=1 -d "$CONNECTION" >"$WORKDIR/restored.tsv" <<'SQL'
SELECT format('SELECT %L, count(*) FROM %I.%I', n.nspname || '.' || c.relname, n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'auth') AND c.relkind IN ('r', 'p') AND NOT c.relispartition
ORDER BY 1 \gexec
SQL

# The manifest's tables are compared: a newer Supabase may bring `auth`
# tables the backup did not have, and that is not a loss.
set +e
awk -F'\t' '
  NR == FNR { restored[$1] = $2; next }
  !($1 in restored) { print "   missing table " $1; bad = 1; next }
  restored[$1] != $2 { print "   " $1 ": backup " $2 ", restored " restored[$1]; bad = 1; next }
  { tables++; rows += $2 }
  END { if (!bad) print "   " tables " tables and " rows " rows, equal to the manifest"; exit bad }
' "$WORKDIR/restored.tsv" "$FOLDER/conteos.tsv"
MATCHES=$?
set -e

[ -z "$TARGET" ] && dropdb "$LOCAL_DB"

if [ $MATCHES -ne 0 ]; then
  stop "The counts do NOT match the manifest: the restore is not complete."
fi
echo "Restore verified."
