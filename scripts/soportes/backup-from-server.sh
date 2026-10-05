#!/usr/bin/env bash
#
# Brings the server's receipt store down to a dated local folder: the backup
# taken before moving receipts to Supabase Storage (phase 6.9), and the source
# the copy to the bucket reads from.
#
# Rules:
#   - ONE ssh connection for the files (rsync), plus one to count them. The
#     host has a tiny process cap and every extra session competes with the app.
#   - No --delete, ever: this only adds to the local folder.
#   - Read-only on the server.
#
# Usage: bash scripts/soportes/backup-from-server.sh [destination]
#   default destination: $COCO_DATA_DIR/respaldos/soportes-YYYYMMDD-HHMMSS
#   COCO_DATA_DIR defaults to ~/Documents/VS Code/Personal/coco-datos: real
#   receipts live OUTSIDE the repository (see docs/runbook.md).
set -euo pipefail

PORT=65002
KEY="$HOME/.ssh/hostinger_cocoapp"
SERVER="u523998927@5.183.10.14"
REMOTE="soportes-cocoapp"
SSH_CMD="ssh -i ${KEY} -p ${PORT} -o BatchMode=yes -o ConnectTimeout=15"

cd "$(dirname "$0")/../.."
COCO_DATA_DIR="${COCO_DATA_DIR:-$HOME/Documents/VS Code/Personal/coco-datos}"
DEST="${1:-$COCO_DATA_DIR/respaldos/soportes-$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$DEST"
chmod 700 "$DEST"

echo "▸ ${SERVER}:~/${REMOTE}/ → ${DEST}/"
rsync -a --stats -e "$SSH_CMD" "$SERVER:~/${REMOTE}/" "$DEST/" | grep -E "Number of (regular )?files|Total file size" || true

LOCAL_COUNT=$(find "$DEST" -type f | wc -l | tr -d ' ')
REMOTE_COUNT=$($SSH_CMD "$SERVER" "find ~/${REMOTE} -type f | wc -l" | tr -d ' ')
echo "   server ${REMOTE_COUNT} · local ${LOCAL_COUNT} · $(du -sh "$DEST" | cut -f1)"

if [ "$LOCAL_COUNT" -lt "$REMOTE_COUNT" ]; then
  echo "FAIL: the local copy is missing files. Run it again." >&2
  exit 1
fi

echo "$DEST"
