# 0034 — List totals under a category filter count the parts inside the branch

- Status: accepted
- Date: 2026-10-11
- Deciders: the director of the round-5 audit, step R5-A

## Context and problem statement

Filtering by a category brings its whole branch. The dashboard matched a row
through its header OR one of its splits and, since R4-A (A1), trimmed every
split row to the parts inside the branch before adding the flow. The list
matched the header alone and summed whole rows for `meta.sumExpense` and
`meta.sumIncome`. The same filter gave two figures on two screens (audit
round 5, finding A2).

## Decision

One condition, `inConcepts` in `transactions.where.ts`, says what "belongs to
these concepts" means (header or `splits.some`); the list filter, the search
by category name (`q`) and the dashboard all read it.

With a category filter, `meta.sumExpense` and `meta.sumIncome` are the sums
of the PARTS inside the branch, as `restrictToBranch` does for the dashboard:
a row without splits pays its whole amount, a split row pays only the splits
in the branch, and a split row that names the branch only in its header pays
nothing. `meta.total` and the rows stay as they are: a purchase that touches
the branch through one split IS in the list, whole.

Without a category filter nothing changes: the sums are the whole rows of the
filter, done by the database.

## Consequences

- The list footer and the dashboard flow agree for the same branch (e2e
  `dashboard-branch`).
- A branch filter costs three aggregate queries instead of one; the sums are
  still computed by the database, never by paging every row.
- The meaning of `meta.sum*` under a category filter is now "what the branch
  cost", not "what the matching rows cost". The contract's shape is unchanged.
