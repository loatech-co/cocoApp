#!/usr/bin/env bash
#
# Restores a backup made by backup.sh and proves it came back whole: it counts
# the rows of every table in `public` and `auth` and compares them with the
# ones the manifest wrote down at backup time, checks the sha256 of every
# file of the bucket, and checks that the privileges of `coco_app` came back
# as narrow as the migrations left them.
#
# Usage:
#   bash scripts/restore.sh [backup]
#       Without --target it restores into a throwaway LOCAL database
#       (coco_restore_test, or $COCO_RESTORE_DB, which must end in
#       _restore_test), compares and drops it, also when something fails.
#       `backup` is a coco-<date>.tar.age or an already decrypted folder; by
#       default, the newest one in $COCO_DATA_DIR/respaldos.
#
#   COCO_RESTORE_TARGET_URL=<url> bash scripts/restore.sh [backup] --target [NAME]
#       Restores into another plain Postgres. The URL is read from the
#       environment variable NAME (COCO_RESTORE_TARGET_URL by default), never
#       from the command line: argv is visible in `ps` to every process on the
#       machine for as long as the restore runs. It asks you to type the name
#       of the target database, letter by letter. A Supabase project is NOT a
#       supported target (ADR 0033): `auth` and the bucket belong to the
#       platform there, and that path was never rehearsed. Restoring into
#       production is an owner STOP (docs/runbook.md, "Restore").
#
# Privileges (ADR 0033): the dump carries every GRANT and REVOKE of
# production. Objects are restored without them (--no-privileges) and the
# privileges of `public` and `app_private` are applied in a second pass,
# keeping only the statements whose grantee exists on the target (or PUBLIC):
# a local Postgres has no `service_role`. `auth` keeps none (Supabase's), and
# the dump's ALTER DEFAULT PRIVILEGES stay out: they hang off the owner role,
# which --no-owner leaves behind. The restore sets them again as the role it
# connects with, which now owns every table: the RLS migration that set them
# is already in _prisma_migrations and never runs again, so without this the
# first table the next migration created would be born without a grant.
#
# Connections go in as PG* variables, never as a URL on a command line, and
# the target URL is exported to the one process that splits it, not to every
# child: a password in the environment of pg_restore, psql or node is a
# password in a crash report.
#
# The names inside a backup (`conteos.tsv`, `sumas.sha256`, `soportes/`) are
# a stored format and stay as they are: every backup already on disk has them.
set -euo pipefail

# A relative backup path is relative to where the command was typed, not to
# the repository root the script moves to.
INVOKED_FROM="$PWD"
cd "$(dirname "$0")/.."

COCO_DATA_DIR="${COCO_DATA_DIR:-$HOME/Coding/VS Code/Personal/coco-datos}"
PRIVATE_KEY="${COCO_BACKUP_KEY:-${COCO_KEYS_DIR:-$HOME/.config/coco}/respaldo.key}"
ENV_FILE="${COCO_ENV_FILE:-api/.env.supabase}"
LOCAL_DB="${COCO_RESTORE_DB:-coco_restore_test}"
APP_ROLE=coco_app
# shellcheck source=scripts/db/expected-policies.sh
. scripts/db/expected-policies.sh

export PATH="/opt/homebrew/opt/postgresql@17/bin:/opt/homebrew/opt/libpq/bin:$PATH"

stop() {
  echo "$1" >&2
  exit 1
}

BACKUP=""
TARGET=""
TARGET_VAR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --target)
      TARGET_VAR=COCO_RESTORE_TARGET_URL
      # An optional NAME of the variable that holds the URL, like pg-env.mjs.
      if [ $# -ge 2 ] && [[ "$2" =~ ^[A-Z_][A-Z0-9_]*$ ]]; then
        TARGET_VAR="$2"
        shift
      elif [ $# -ge 2 ] && [[ "$2" == *://* ]]; then
        stop "--target takes no url: put it in COCO_RESTORE_TARGET_URL (or --target NAME), never on the command line."
      fi
      TARGET="${!TARGET_VAR:-}"
      [ -n "$TARGET" ] || stop "--target reads the url from \$$TARGET_VAR, which is empty."
      shift
      ;;
    -*) stop "Unknown option: $1" ;;
    *)
      case "$1" in
        /*) BACKUP="$1" ;;
        *) BACKUP="$INVOKED_FROM/$1" ;;
      esac
      shift
      ;;
  esac
done

if [ -z "$BACKUP" ]; then
  # The name carries the date: the last one in alphabetical order is the
  # newest. Only finished names: `coco-<date>-incompleto.tar.age` or a
  # `.partial` left by hand would otherwise pass for a backup.
  BACKUP="$(find "$COCO_DATA_DIR/respaldos" -maxdepth 1 -name 'coco-[0-9]*-[0-9]*.tar.age' |
    grep -E '/coco-[0-9]{8}-[0-9]{6}\.tar\.age$' | sort | tail -1 || true)"
  [ -n "$BACKUP" ] || stop "There is no coco-<date>.tar.age in $COCO_DATA_DIR/respaldos."
fi

# ── 1. The target, before opening anything ───────────────────────────────────
database_name() { sed -E 's#^[a-z]+://[^/]*/([^?]*).*#\1#' <<<"$1"; }

if [ -z "$TARGET" ]; then
  [[ "$LOCAL_DB" == *_restore_test ]] || stop "The local database must end in _restore_test (it is: $LOCAL_DB)."
  export PGDATABASE="$LOCAL_DB"
else
  DB="$(database_name "$TARGET")"
  [ -n "$DB" ] || stop "Could not read the database name from the --target url."

  # Production is the one with the ref of api/.env.supabase; any Supabase is
  # out anyway, but production deserves its own words.
  REF=""
  [ -f "$ENV_FILE" ] &&
    REF="$(grep -E '^SUPABASE_URL=' "$ENV_FILE" | sed -E 's#^[^/]*//([^.]+)\..*#\1#')"
  if [ -n "$REF" ] && [[ "$TARGET" == *"$REF"* ]]; then
    stop "The target is PRODUCTION. Restoring there is an owner stop: docs/runbook.md, \"Restore\"."
  fi
  [[ "$TARGET" != *supabase* ]] ||
    stop "A Supabase project is not a supported target (ADR 0033): docs/runbook.md, \"Restore\", says what to do by hand."

  read -r -p "Type the name of the target database ($DB) to confirm: " CONFIRMATION </dev/tty
  [ "$CONFIRMATION" = "$DB" ] || stop "It does not match. Nothing was restored."
  # Exported to that one node process only (a prefix assignment), not to the
  # whole script: the PG* variables it prints are what the children get.
  eval "$(COCO_RESTORE_TARGET_URL="$TARGET" node scripts/db/pg-env.mjs COCO_RESTORE_TARGET_URL)"
fi

# ── 2. Open the backup ───────────────────────────────────────────────────────
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/coco-restore.XXXXXX")"
chmod 700 "$WORKDIR"
# Cleans up and keeps the exit status: bash 3.2 (the one macOS ships) can
# otherwise exit 0 after a failure when an EXIT trap runs. The throwaway
# database goes too, whatever happened: it holds real data, decrypted.
cleanup() {
  local status=$?
  rm -rf "$WORKDIR"
  [ -n "$TARGET" ] || dropdb --if-exists "$LOCAL_DB" >/dev/null 2>&1 || true
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

# ── 4. Restore the objects ───────────────────────────────────────────────────
if [ -z "$TARGET" ]; then
  echo "▸ Restoring into the throwaway local database ${LOCAL_DB}…"
  dropdb --if-exists "$LOCAL_DB"
  createdb "$LOCAL_DB"
else
  echo "▸ Restoring into ${DB}…"
fi
# The policies and the grants name the application role: without it the
# restore would fail halfway, or come back with nobody allowed in.
ROLES="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "SELECT string_agg(rolname, ',') FROM pg_roles")"
[[ ",$ROLES," == *",$APP_ROLE,"* ]] ||
  stop "The role $APP_ROLE does not exist on the target: create it first (scripts/db/create-app-role.sh)."

START=$SECONDS
# --clean on a freshly created database too: since Postgres 15 every database
# is born with a `public` schema, and the dump's CREATE SCHEMA would clash
# with it.
pg_restore --no-owner --no-privileges --exit-on-error --clean --if-exists -d "$PGDATABASE" "$FOLDER/db.dump"

# ── 5. The privileges of public and app_private ──────────────────────────────
# `pg_restore -l` lists one line per entry: "<id>; <oid> <oid> ACL <schema>
# <TYPE> <name> <owner>", and "DEFAULT ACL" for ALTER DEFAULT PRIVILEGES.
pg_restore -l "$FOLDER/db.dump" |
  grep -E '^[0-9]+; [0-9]+ [0-9]+ ACL ' |
  grep -Ev ' ACL auth | SCHEMA auth ' >"$WORKDIR/acl.list" || true
if [ -s "$WORKDIR/acl.list" ]; then
  pg_restore -L "$WORKDIR/acl.list" --no-owner -f - "$FOLDER/db.dump" |
    node scripts/restore/filter-privileges.mjs --roles "$ROLES" |
    psql -X -q -o /dev/null -v ON_ERROR_STOP=1 --single-transaction
else
  echo "⚠️  The dump carries no privileges: it predates ADR 0033." >&2
fi
# The defaults for what the NEXT migration creates, owned by the connecting
# role because every restored object is (--no-owner): the same two statements
# as migration 20261006000000.
psql -X -q -v ON_ERROR_STOP=1 -v role="$APP_ROLE" <<'SQL'
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"role";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO :"role";
SQL
echo "   restored in $((SECONDS - START)) s"

# ── 6. Count ─────────────────────────────────────────────────────────────────
echo "▸ Counting rows…"
psql -X -q -A -t -F $'\t' -v ON_ERROR_STOP=1 >"$WORKDIR/restored.tsv" <<'SQL'
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
[ $MATCHES -eq 0 ] || stop "The counts do NOT match the manifest: the restore is not complete."

# ── 7. The privileges of the application role ───────────────────────────────
# scripts/restore/check-app-role.sql: what the migrations narrowed must still
# be narrow, what they granted must be there (tables, columns, sequences,
# schemas, functions), the defaults above must cover the next table, and
# row-level security must be forced on every table with all its policies. A
# dump restored without its privileges passes the counts and fails here. A
# function a pending migration has not created yet is not a failure (B1).
echo "▸ Checking the privileges of ${APP_ROLE}…"
WRONG="$(psql -X -A -t -v ON_ERROR_STOP=1 -v role="$APP_ROLE" -v expected_policies="$EXPECTED_POLICIES" \
  -f scripts/restore/check-app-role.sql)"
[ -z "$WRONG" ] || stop "The privileges of $APP_ROLE are NOT as the migrations left them (scripts/restore/check-app-role.sql): $WRONG."
echo "   as the migrations left them"

echo "Restore verified."
