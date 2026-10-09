#!/usr/bin/env bash
#
# FULL backup of production, encrypted, off the laptop and tested.
#
# ── What it holds ────────────────────────────────────────────────────────────
#   - the `public` schema: schema and data, the whole application;
#   - Supabase's `auth` schema: users, identities and sessions. Without it,
#     restoring `public` brings back the data of accounts nobody can sign in
#     to;
#   - the private `soportes` bucket, object by object, each one checked by
#     sha256 against `soportes.huella`;
#   - a manifest with the rows of each table, counted in the SAME snapshot of
#     the database as the dump (scripts/backup/extract.mjs explains why).
#
# ── Why the free plan is not enough ──────────────────────────────────────────
# Free Supabase keeps backups for a short time, without point-in-time
# recovery, and does not back up the bucket. A backup of our own, on a disk
# we control, is the only thing that survives someone deleting the project by
# mistake or the account being suspended.
#
# ── Read-only ────────────────────────────────────────────────────────────────
# It reads production with api/.env.supabase inside a READ ONLY transaction
# and downloads the bucket with GET. It writes nothing there.
#
# ── Encryption ───────────────────────────────────────────────────────────────
# With age (https://age-encryption.org), to the PUBLIC key in
# ~/.config/coco/respaldo.pub (or $COCO_BACKUP_RECIPIENT). Encrypting does not
# need the private key; restoring does. Where the owner keeps it:
# docs/runbook.md, "Backups and restore".
#
# ── Where it ends up ─────────────────────────────────────────────────────────
# $COCO_DATA_DIR/respaldos/coco-<date>.tar.age (by default
# ~/Documents/VS Code/Personal/coco-datos/respaldos). Documents is under
# iCloud Drive: that is the "off the laptop". Only the encrypted file is
# uploaded; the plain copy is assembled in a private temporary folder and
# deleted at the end. (The folder and key names on disk stay in Spanish: they
# hold every backup made so far.)
#
# ── Tested or it is not a backup ─────────────────────────────────────────────
# At the end it restores the encrypted file into a throwaway local database
# with scripts/restore.sh, and compares the rows of each table with the
# manifest.
#
# Usage: npm run backup [-- <target folder>]
set -euo pipefail

cd "$(dirname "$0")/.."

COCO_DATA_DIR="${COCO_DATA_DIR:-$HOME/Documents/VS Code/Personal/coco-datos}"
TARGET="${1:-$COCO_DATA_DIR/respaldos}"
ENV_FILE="${COCO_ENV_FILE:-api/.env.supabase}"
KEYS="${COCO_KEYS_DIR:-$HOME/.config/coco}"
PRIVATE_KEY="${COCO_BACKUP_KEY:-$KEYS/respaldo.key}"

export PATH="/opt/homebrew/opt/postgresql@17/bin:/opt/homebrew/opt/libpq/bin:$PATH"

missing() {
  echo "Missing $1. $2" >&2
  exit 1
}
command -v pg_dump >/dev/null || missing pg_dump "Install it with: brew install postgresql@17"
command -v age >/dev/null || missing age "Install it with: brew install age"
[ -f "$ENV_FILE" ] || missing "$ENV_FILE" "It is the one that holds the production credentials."

# ── The encryption recipient ─────────────────────────────────────────────────
if [ -n "${COCO_BACKUP_RECIPIENT:-}" ]; then
  RECIPIENT="$COCO_BACKUP_RECIPIENT"
elif [ -f "$KEYS/respaldo.pub" ]; then
  RECIPIENT="$(cat "$KEYS/respaldo.pub")"
elif [ -f "$PRIVATE_KEY" ]; then
  RECIPIENT="$(age-keygen -y "$PRIVATE_KEY")"
else
  missing "the encryption key" "Create it with:
  mkdir -p \"$KEYS\" && chmod 700 \"$KEYS\"
  age-keygen -o \"$PRIVATE_KEY\" && chmod 600 \"$PRIVATE_KEY\"
  age-keygen -y \"$PRIVATE_KEY\" > \"$KEYS/respaldo.pub\"
and keep a copy of the private key where docs/runbook.md says."
fi

mkdir -p "$TARGET"
STAMP=$(date +%Y%m%d-%H%M%S)
NAME="coco-$STAMP"
ARCHIVE="$TARGET/$NAME.tar.age"

# The plain copy, in a temporary folder of our own (never in iCloud).
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/coco-backup.XXXXXX")"
chmod 700 "$WORKDIR"
cleanup() {
  local status=$?
  rm -rf "$WORKDIR"
  rm -f "$ARCHIVE.partial"
  exit "$status"
}
trap cleanup EXIT
PLAIN="$WORKDIR/$NAME"

START=$SECONDS
echo "▸ Extracting production (read-only)…"
npx dotenv -e "$ENV_FILE" -- node scripts/backup/extract.mjs --out "$PLAIN"

echo "▸ Encrypting with age…"
tar -C "$WORKDIR" -cf - "$NAME" | age -r "$RECIPIENT" -o "$ARCHIVE.partial"
chmod 600 "$ARCHIVE.partial"
mv "$ARCHIVE.partial" "$ARCHIVE"
echo "   $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"

echo "▸ Testing the restore…"
if [ -f "$PRIVATE_KEY" ]; then
  # Tests what was really stored: the encrypted file.
  bash scripts/restore.sh "$ARCHIVE"
else
  # Without the private key on this machine it cannot be decrypted. The
  # plain copy is tested instead, with a warning: that the encryption opens
  # is left unproven.
  bash scripts/restore.sh "$PLAIN"
  echo "⚠️  The private key is not at $PRIVATE_KEY: the plain copy was tested, not the encrypted file." >&2
fi

# ── Is it off the laptop? ────────────────────────────────────────────────────
# Documents syncs with iCloud Drive if the folder belongs to the iCloud file
# provider. It warns, it does not fail: the upload is asynchronous and may
# take a while.
in_icloud() {
  local folder
  folder="$(cd "$1" && pwd -P)"
  while [ "$folder" != "/" ]; do
    if xattr -p com.apple.file-provider-domain-id "$folder" 2>/dev/null | grep -q CloudDocs; then
      return 0
    fi
    folder="$(dirname "$folder")"
  done
  return 1
}
if in_icloud "$TARGET"; then
  echo "   target under iCloud Drive: it uploads by itself"
else
  echo "⚠️  $TARGET is NOT under iCloud Drive: the backup is only on this machine." >&2
fi

echo ""
echo "Backup complete and tested: $ARCHIVE ($((SECONDS - START)) s)"

# No backup is deleted here. The retention policy is a proposal awaiting the
# owner (docs/runbook.md, "Backups and restore").
echo "   ($(find "$TARGET" -maxdepth 1 -name 'coco-*' -type f | wc -l | tr -d ' ') backups in $TARGET)"
