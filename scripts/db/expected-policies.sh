# shellcheck shell=bash
# The number of row-level security policies the schema carries: one per
# table, all TO coco_app (ADR 0024). Sourced by verify-data-api-closed.sh
# (after every production migration) and restore.sh (after every restore), so
# both count the same thing; override with EXPECTED_POLICIES when the schema
# grows.
EXPECTED_POLICIES="${EXPECTED_POLICIES:-14}"
