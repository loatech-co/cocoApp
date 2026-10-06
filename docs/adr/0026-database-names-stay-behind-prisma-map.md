# 0026 — The database keeps its names; the code is English through Prisma `@map`

- Status: accepted
- Date: 2026-10-05
- Deciders: the owner (after the external review), the director of phase 7, step 7.2-a

## Context and problem statement

Step 7.2 takes every name of the code to English. The rename map
(`docs/standards/rename-map.json`) found Spanish in the database too: 14
columns, the `soportes` table, `audit_log`, the `Periodicidad` enum type and its
five values. The first plan (`docs/standards/rename-plan.md`, step r4) moved
them by expand and contract: new column or table, double write, backfill,
row-by-row check, contraction. It also renamed the enum TYPES and the
`soportes` bucket, and changed 14 `timestamp(3)` columns to `timestamptz(3)`.

Each of those is a production data move for a name nobody outside the code
reads.

## Decision

1. **The code is English; the database keeps its names.** The Prisma client
   gets English models, fields and enum values with `@map("<old>")` and
   `@@map("<old>")` (step 7.2-c). No migration moves a column, a table or a
   value. There is no step r4.
2. **The enum type names and the `soportes` bucket stay.** Prisma casts every
   parameter with the type name, so renaming a type breaks the running code
   between the migration and the deploy. The code reads the bucket from
   `RECEIPTS_BUCKET`, default `soportes`.
3. **What does not move data still happens** (step 7.2-r5): constraint and
   index names to the convention (`ALTER … RENAME`) and `updated_at` where it
   is missing (additive).
4. **`timestamp(3)` → `timestamptz(3)` is phase 8.** It is a type change on 14
   columns, not a naming one; the values are UTC already. It gets its own
   decision there.
5. **v1 is retired when its counter has been at zero for one hour**, with the
   web and iOS on v2 (it was seven days).

## Consequences

- Raw SQL (`$queryRaw`, the scripts under `scripts/`, the RLS policies) keeps
  the Spanish column names: a reader of SQL sees `recurrente`, a reader of
  TypeScript sees `isRecurring`. The `@map` lines in `schema.prisma` are the
  one place that pairs them.
- The 7.2 lint (`scripts/lint/spanish-identifiers.ts`) does not read SQL or
  the schema's `@map` strings, so this exception needs no entry there.
- Renaming the database later is still possible, by expand and contract, and
  costs the same as it did: nothing here makes it harder.
