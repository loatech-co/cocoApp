# 0010 — Row-level security with an application role

- Status: proposed (implemented in step 7.11-b)
- Date: 2026-10-05 (D29 of the standards)
- Deciders: the owner, phase 7

## Context and problem statement

User isolation is enforced in code: every query filters by the `user_id` of
the verified token, and an e2e test attacks all routes as a second user. But
the API connects as `postgres`, the table owner with `rolbypassrls`, so one
forgotten filter would expose another user's data and the database would not
object. Supabase gives one role by default; a less privileged one is possible.

## Decision outcome

**The API runs as a dedicated `app` role without `BYPASSRLS`, and every
user-scoped table has a policy keyed on a per-transaction setting:**
`set_config('app.user_id', <id>, true)` inside a Prisma `$transaction`, on
the transaction pooler (port 6543), applied in the repository layer.
Migrations keep running as the owner.

## Consequences

- Good: the database becomes the second lock behind the code's filter.
- Bad: every user-scoped query runs inside a transaction; the cost is to be
  measured against the 7.9 budgets before this is accepted.
- The data API script ([0007](0007-close-supabase-data-api-by-script.md))
  checks for zero policies today and has to change with this.
