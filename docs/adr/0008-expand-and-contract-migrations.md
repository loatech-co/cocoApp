# 0008 — Additive migrations first; breaking changes by expand and contract

- Status: accepted
- Date: 2026-10-04 (phase 1), restated for phase 7 (D28)
- Deciders: the owner

## Context and problem statement

The host deploys code minutes after a push, and for a while the old code runs
against the new schema (and, on a failed deploy, keeps running). A migration
that renames, drops or retypes a column breaks whichever version does not
expect it. Production holds real financial data with no point-in-time
recovery on the free plan.

## Decision outcome

**A migration is additive and reaches production before the code that uses
it. Anything that breaks — rename, drop, type change — goes through expand
and contract, and dropping is a stop for the owner.**

1. Expand: add the new column, table or name next to the old one; write both.
2. Backfill and verify row by row.
3. Move every reader to the new shape and deploy.
4. Contract: drop the old one only after a tested backup, a full deploy, and
   — for API routes — one hour with zero uses of the old one after every
   client moved (owner's decision, 2026-10-06; it was seven days). The v1 of
   the API was retired that way on 2026-10-06 (step 7.10).

The gate before applying: `prisma migrate status` against production must
list exactly the migrations expected, checked by the operator or by a script
reading its output. Piping a blind "yes" into the confirmation removes the
only check that protects production.

The proof that old code survives the new schema: generate the Prisma client
from the deployed commit and run it against a local database that already has
the migration.

## Consequences

- Good: a deploy can fail or be reverted without the schema breaking the
  version that keeps running.
- Bad: renames take two deploys and a waiting period.
- See [the runbook](../runbook.md#migrations) for the commands.
