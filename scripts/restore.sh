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
#   bash scripts/restore.sh [backup] --target <url>
#       Restores into another plain Postgres. It asks you to type the name of
#       the target database, letter by letter. A Supabase project is NOT a
#       supported target (ADR 0033): `auth` and the bucket belong to the
#       platform there, and that path was never rehearsed. Restoring into
#       production is an owner STOP (docs/runbook.md, "Restore").
#
# Privileges (ADR 0033): the dump carries every GRANT and REVOKE of
# production. Objects are restored without them (--no-privileges) and the
# privileges of `public` and `app_private` are applied in a second pass,
# keeping only the statements whose grantee exists on the target (or PUBLIC):
# a local Postgres has no `service_role`. `auth` keeps none (Supabase's), and
# ALTER DEFAULT PRIVILEGES stay out: they hang off the owner role, which
# --no-owner leaves behind, and the RLS migration owns them.
#
# The names inside a backup (`conteos.tsv`, `sumas.sha256`, `soportes/`) are
# a stored format and stay as they are: every backup already on disk has them.
set -euo pipefail

cd "$(dirname "$0")/.."

COCO_DATA_DIR="${COCO_DATA_DIR:-$HOME/Coding/VS Code/Personal/coco-datos}"
PRIVATE_KEY="${COCO_BACKUP_KEY:-${COCO_KEYS_DIR:-$HOME/.config/coco}/respaldo.key}"
ENV_FILE="${COCO_ENV_FILE:-api/.env.supabase}"
LOCAL_DB="${COCO_RESTORE_DB:-coco_restore_test}"
APP_ROLE=coco_app

export PATH="/opt/homebrew/opt/postgresql@17/bin:/opt/homebrew/opt/libpq/bin:$PATH"

stop() {
  echo "$1" >&2
  exit 1
}

BACKUP=""
TARGET=""
while [ $# -gt 0 ]; do
  case "$1" in
    --target)
      [ $# -ge 2 ] || stop "--target needs a url."
      TARGET="$2"
      shift 2
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

if [ -z "$TARGET" ]; then
  [[ "$LOCAL_DB" == *_restore_test ]] || stop "The local database must end in _restore_test (it is: $LOCAL_DB)."
  CONNECTION="$LOCAL_DB"
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
  CONNECTION="$TARGET"
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
ROLES="$(psql -X -A -t -v ON_ERROR_STOP=1 -d "$CONNECTION" -c "SELECT string_agg(rolname, ',') FROM pg_roles")"
[[ ",$ROLES," == *",$APP_ROLE,"* ]] ||
  stop "The role $APP_ROLE does not exist on the target: create it first (scripts/db/create-app-role.sh)."

START=$SECONDS
# --clean on a freshly created database too: since Postgres 15 every database
# is born with a `public` schema, and the dump's CREATE SCHEMA would clash
# with it.
pg_restore --no-owner --no-privileges --exit-on-error --clean --if-exists -d "$CONNECTION" "$FOLDER/db.dump"

# ── 5. The privileges of public and app_private ──────────────────────────────
# `pg_restore -l` lists one line per entry: "<id>; <oid> <oid> ACL <schema>
# <TYPE> <name> <owner>", and "DEFAULT ACL" for ALTER DEFAULT PRIVILEGES.
pg_restore -l "$FOLDER/db.dump" |
  grep -E '^[0-9]+; [0-9]+ [0-9]+ ACL ' |
  grep -Ev ' ACL auth | SCHEMA auth ' >"$WORKDIR/acl.list" || true
if [ -s "$WORKDIR/acl.list" ]; then
  pg_restore -L "$WORKDIR/acl.list" --no-owner -f - "$FOLDER/db.dump" |
    node scripts/restore/filter-privileges.mjs --roles "$ROLES" |
    psql -X -q -o /dev/null -v ON_ERROR_STOP=1 --single-transaction -d "$CONNECTION"
else
  echo "⚠️  The dump carries no privileges: it predates ADR 0033." >&2
fi
echo "   restored in $((SECONDS - START)) s"

# ── 6. Count ─────────────────────────────────────────────────────────────────
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
[ $MATCHES -eq 0 ] || stop "The counts do NOT match the manifest: the restore is not complete."

# ── 7. The privileges of the application role ────────────────────────────────
# What the migrations narrowed (20261006000000, …200 and …300) must still be
# narrow, and what they granted must be there: a dump restored without its
# privileges passes the first half and fails the second.
echo "▸ Checking the privileges of ${APP_ROLE}…"
WRONG="$(psql -X -A -t -v ON_ERROR_STOP=1 -d "$CONNECTION" -v role="$APP_ROLE" <<'SQL'
SELECT string_agg(name, ', ') FROM (VALUES
  ('users DELETE', has_table_privilege(:'role', 'public.users', 'DELETE')),
  ('users.role UPDATE', has_column_privilege(:'role', 'public.users', 'role', 'UPDATE')),
  ('audit_log UPDATE', has_table_privilege(:'role', 'public.audit_log', 'UPDATE')),
  ('audit_log DELETE', has_table_privilege(:'role', 'public.audit_log', 'DELETE')),
  ('_prisma_migrations SELECT', has_table_privilege(:'role', 'public._prisma_migrations', 'SELECT')),
  ('no users SELECT', NOT has_table_privilege(:'role', 'public.users', 'SELECT')),
  ('no users.last_login_at UPDATE', NOT has_column_privilege(:'role', 'public.users', 'last_login_at', 'UPDATE')),
  ('no audit_log INSERT', NOT has_table_privilege(:'role', 'public.audit_log', 'INSERT')),
  ('no transactions DELETE', NOT has_table_privilege(:'role', 'public.transactions', 'DELETE'))
) AS checks(name, wrong) WHERE wrong
SQL
)"
[ -z "$WRONG" ] || stop "The privileges of $APP_ROLE are NOT as the migrations left them: $WRONG."
echo "   as the migrations left them"

echo "Restore verified."
