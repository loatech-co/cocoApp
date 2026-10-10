# 0031 — The `import_*` tables stay until the owner decides on statement imports

- Status: accepted (postponed item of the senior checklist)
- Date: 2026-10-09
- Deciders: the owner (5 Oct 2026), the director of phase 7

## Context and problem statement

Phase 6.6 retired the `imports` module: no route, service or screen reads or
writes bank statements any more. Its storage stayed: `import_batches`,
`import_rows` and the column `transactions.import_batch_id` with its foreign
key and index. The senior checklist asks for those tables to be gone.

Whether bank statements come back is a product question. They are the
capture path that would cover the most expenses at once, and the owner has
not decided. Dropping the tables now would throw away the schema and any
rows that a revived import would want to reconcile against.

## Decision

1. **`import_batches`, `import_rows` and `transactions.import_batch_id` are
   not dropped in phase 7.** That is a row of the stops-and-deletions table
   in `CLAUDE.md`, the only place that rule lives.
2. **Nothing new may use them** until the decision is taken. In the table
   ownership check (`scripts/ci/table-ownership.mjs`) they are parked under
   `modules/categories`, which only touches `import_rows` to move their
   category when a category is deleted and its transactions reassigned, so
   that no old row points at a category that is gone; and the RLS policies keep them per user like every other table.
3. **The decision is an owner item of phase 8** (plan, 8.6). Either:
   - statements come back, and a new module owns the tables, possibly with
     a new design by expand and contract; or
   - they do not, and the drop is its own step: full backup and a tested
     restore first, as the table in `CLAUDE.md` demands, then a migration
     that drops the foreign key, the column and the two tables.

## Considered options

- **Drop them now.** Irreversible on the free Supabase plan without the
  backup ritual, and it presumes the product answer.
- **Archive the rows to a file and drop.** Still presumes the answer, and a
  revived import would have to load them back.

## Consequences

- The senior checklist item "`imports` tables removed" stays **postponed**,
  with this ADR as its evidence.
- Two unused tables remain in the schema and in every backup; they cost
  nothing measurable.
