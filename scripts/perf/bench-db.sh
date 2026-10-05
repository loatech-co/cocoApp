#!/usr/bin/env bash
# Throwaway database for the performance benchmarks.
#
#   bash scripts/perf/bench-db.sh create          # copy of coco_dev
#   bash scripts/perf/bench-db.sh create --long   # plus 20 years of history
#   bash scripts/perf/bench-db.sh synthetic       # invented data, no coco_dev needed
#   bash scripts/perf/bench-db.sh drop
#
# Local only. It never touches coco_test (the e2e suites of other runs empty
# it) and never a remote host. coco_dev is read with pg_dump, not used as a
# TEMPLATE, so an open connection to it does not get in the way.
set -euo pipefail

HOST="${PGHOST:-localhost}"
SOURCE="${COCO_BENCH_SOURCE:-coco_dev}"
TARGET="${COCO_BENCH_DB:-coco_bench}"
HERE="$(cd "$(dirname "$0")" && pwd)"

case "$HOST" in
  localhost | 127.0.0.1 | /*) ;;
  *)
    echo "bench-db: only a local Postgres, not '$HOST'" >&2
    exit 1
    ;;
esac
case "$TARGET" in
  coco_bench*) ;;
  *)
    echo "bench-db: the target must be named coco_bench*, not '$TARGET'" >&2
    exit 1
    ;;
esac

case "${1:-}" in
  create)
    dropdb -h "$HOST" --if-exists "$TARGET"
    createdb -h "$HOST" "$TARGET"
    pg_dump -h "$HOST" --no-owner --no-privileges "$SOURCE" | psql -h "$HOST" -q -d "$TARGET" >/dev/null
    if [ "${2:-}" = "--long" ]; then
      psql -h "$HOST" -q -d "$TARGET" -f "$HERE/enlarge.sql" >/dev/null
    fi
    psql -h "$HOST" -d "$TARGET" -Atc "ANALYZE" >/dev/null
    psql -h "$HOST" -d "$TARGET" -Atc "SELECT 'transactions: ' || count(*) FROM transactions"
    ;;
  synthetic)
    # Empty database, the real migrations, then synthetic.sql. What CI uses.
    dropdb -h "$HOST" --if-exists "$TARGET"
    createdb -h "$HOST" "$TARGET"
    URL="${COCO_BENCH_DATABASE_URL:-postgresql://$(whoami)@localhost:5432/$TARGET}"
    (cd "$HERE/../../api" && DATABASE_URL="$URL" DIRECT_URL="$URL" npx prisma migrate deploy >/dev/null)
    psql -h "$HOST" -q -v ON_ERROR_STOP=1 -d "$TARGET" -f "$HERE/synthetic.sql" >/dev/null
    psql -h "$HOST" -d "$TARGET" -Atc "ANALYZE" >/dev/null
    psql -h "$HOST" -d "$TARGET" -Atc "SELECT 'transactions: ' || count(*) FROM transactions"
    ;;
  drop)
    dropdb -h "$HOST" --if-exists "$TARGET"
    ;;
  *)
    echo "usage: bench-db.sh create [--long] | synthetic | drop" >&2
    exit 1
    ;;
esac
