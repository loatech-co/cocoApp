# 0012 — Lists are paginated by page; cursors only for append-only feeds

- Status: accepted
- Date: 2026-10-05 (D9 of `docs/standards/decisions.md`)
- Deciders: phase 7, under the plan's maturity rule

## Context and problem statement

The plan's default was cursor pagination for every list,
`{ data, meta: { nextCursor, total? } }`. But the web's paginator shows page
numbers on purpose (with eight pages, one wants to jump to the fifth), and
the transactions table sorts by a column the user picks. A cursor cannot
jump to a page and needs a composite key for each sortable column.

## Considered options

- Cursor everywhere.
- **Page/offset by default, cursor where the client appends.**

## Decision outcome

**Tables use `{ data, meta: { page, perPage, total } }`. A cursor
(`nextCursor`) is used only where the client appends: the iOS sync queue and
infinite feeds. Both envelopes are defined once in the API's `common/`.**

## Consequences

- Good: no redesign of the paginator; user-chosen sorting stays simple.
- Neutral: offset's deep-page cost does not apply — data is per user, a few
  thousand rows, indexed by `user_id`.
- Bad: two envelopes to know; the rule above says which one applies.
