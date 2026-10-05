# 0019 — Row-level security: `forUser`, the paths that cross users, and its cost

- Status: accepted — prepared, **not active in production** (see Decision outcome)
- Date: 2026-10-05 (step 7.11-b)
- Deciders: the owner, phase 7
- Implements [0010](0010-rls-with-application-role.md); the setting is named
  `app.current_user_id`, not `app.user_id`.

## Context and problem statement

[0010](0010-rls-with-application-role.md) decided that the API runs as a role
without `BYPASSRLS` and that every user-scoped table has a policy keyed on a
transaction-local setting. Implementing it left four questions open: where the
setting is applied so no repository can skip it, what to do with the queries
that legitimately cross users, what the owner role becomes once `FORCE` is on,
and what it costs against the 7.9 budget (p95 ≤ 50 ms).

## Decision outcome

**One helper, `Database.forUser(userId, tx => …)`** (`api/src/prisma/database.ts`),
opens an interactive `$transaction` whose first statement is
`SELECT set_config('app.current_user_id', $1, true)`. Every repository injects
`Database`, never `PrismaService`; `database.rule.spec.ts` reads the source and
fails otherwise, with a closed list of exceptions and the only calls each may
make. Nested calls for the same user reuse the open transaction
(`AsyncLocalStorage`), so a service can group several reads into one unit
(`DashboardService.resumen`); nesting a different user throws.

**Policies** (`20261006000000_add_row_level_security`), all `TO coco_app`:

| Table                                                                                                | Policy                                                                                              |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| accounts, categories, category_rules, import_batches, soportes, tags, transactions, user_preferences | `user_id = setting`, same `WITH CHECK`                                                              |
| transaction_splits, transaction_tags                                                                 | `EXISTS` on the parent `transactions` row of that user                                              |
| import_rows                                                                                          | `EXISTS` on the parent `import_batches` row of that user                                            |
| users                                                                                                | open (`true`) to `coco_app` — the directory, see below                                              |
| audit_log                                                                                            | `INSERT` open; `SELECT` only when the setting's user is an active admin; no `UPDATE`/`DELETE` grant |

The setting is read as `NULLIF(current_setting('app.current_user_id', true), '')::bigint`:
on a pooled connection that already held a local value it reads back as `''`,
and `''::bigint` is an error. With `NULLIF` a query outside any unit sees zero
rows, on a fresh connection or a reused one. Every table already had an index
starting with `user_id` (or the parent key), so no index was added.

**The paths that cross users — no `BYPASSRLS` role for the app.** A second
login role with `BYPASSRLS` would mean a second secret and a second pool for
three call sites; each was solved where it lives instead:

1. **The auth guard and the admin screens read `users`** before the user is
   known, or about everyone. `users` holds no financial rows; its policy is
   open to `coco_app` on purpose and RLS stays enabled, so `anon` and
   `authenticated` still have no policy and no grant
   ([0007](0007-close-supabase-data-api-by-script.md)).
2. **The audit log** is written with no user (a failed login) or about someone
   else (an admin action). Append-only policy plus `createMany` (a `create`
   would `RETURNING` the row, which only an admin may read). The admin log is
   read inside `forUser(adminId)`.
3. **The auto-charge sweep** needs the ids of the users with an auto-paid
   concept. `app_private.auto_paid_owner_ids()`, `SECURITY DEFINER`, returns
   ids and nothing else, has a fixed `search_path`, lives in a schema the
   Supabase data API does not publish, and only `coco_app` may execute it.
   Each charge then runs in `forUser(owner)`. The admin bootstrap needs nothing:
   it creates a `users` row and seeds the categories inside `forUser(newId)`.

**`FORCE`** (`20261006000100_force_row_level_security`) binds the owner too.
It changes nothing for `coco_app` (not the owner) or for `postgres` in Supabase
(`BYPASSRLS` always wins). Consequence: **the owner must have `BYPASSRLS`**,
or its scripts and data fixes see zero rows. Locally,
`scripts/db/create-app-role.sh` gives it to `coco_migrate` (`MIGRATION_ROLE`);
in production the rollout checks it before migrating.

**The role and its password are not in a migration.** The migration grants
privileges and creates `coco_app NOLOGIN` only if it is missing;
`scripts/db/create-app-role.sh` (idempotent, password from the environment
through `\getenv`) gives it `LOGIN`. Through Supavisor the user is
`coco_app.<project-ref>`.

### The cost, measured

`scripts/perf/api-bench.mjs` (7.9), local Postgres 17, `coco_bench` created with
`bench-db.sh create --long` (2,045 movements), 200 timed requests after 20
warmups, median of 5 alternating runs. A = code before this step, as owner.
B = `forUser`, as owner (policies bypassed). C = `forUser`, as `coco_app`.

On top of PR #27 (the 7.9 dashboard fix), the base the step will integrate on:

| Endpoint (ms)                           | p50 A | p50 B | p50 C | p95 A | p95 B | p95 C    |
| --------------------------------------- | ----- | ----- | ----- | ----- | ----- | -------- |
| GET /dashboard (current month)          | 6.4   | 8.6   | 8.3   | 14.1  | 22.7  | 20.7     |
| GET /dashboard (2000-01-01..2026-12-31) | 24.1  | 29.3  | 27.7  | 44.1  | 62.2  | **60.7** |
| GET /transactions (page 1, 25)          | 2.7   | 4.8   | 6.1   | 7.8   | 10.0  | 12.8     |
| GET /transactions (per_page=200)        | 7.0   | 10.1  | 10.1  | 12.6  | 29.5  | 20.1     |
| POST /transactions/capture (manual)     | 5.7   | 6.9   | 7.8   | 13.3  | 19.1  | 15.0     |
| POST /transactions/capture (SMS)        | 7.0   | 9.3   | 9.6   | 18.6  | 22.8  | 20.2     |

On this step's own base (without #27), with G = C plus the dashboard grouped in
one unit:

| Endpoint (ms)                           | p50 A | p50 C | p50 G | p95 A | p95 C | p95 G |
| --------------------------------------- | ----- | ----- | ----- | ----- | ----- | ----- |
| GET /dashboard (current month)          | 9.7   | 11.7  | 11.9  | 21.0  | 25.5  | 26.9  |
| GET /dashboard (2000-01-01..2026-12-31) | 28.0  | 32.9  | 30.2  | 57.7  | 62.7  | 55.8  |

What the numbers say:

- **The policies cost nothing measurable** (B ≈ C). The cost is the unit of
  work: `BEGIN`, `set_config` and `COMMIT` around each repository call, about
  +1 to +3 ms p50 per request locally.
- **p95 is noisy** on this machine (other worktrees ran their suites at the
  same time): the base itself moved from 44 to 58 ms between sessions.
- **The full-range dashboard goes over the 50 ms p95 budget with RLS** (60.7
  against 44.1 on top of #27). Grouping its reads in one unit recovers part of
  it (p50 −2.7 ms) but not enough to call it under budget.
- In production each extra round trip is a trip to the pooler, not to
  localhost, so the per-unit cost grows with the Hostinger→Supabase latency.

**Decision: RLS is prepared, not activated.** Under the plan's own rule
(over budget → ADR, keep the isolation test), production keeps
`DATABASE_URL` on the owner. Everything else ships: the migrations (inert
while the owner connects), the `forUser` code (identical behaviour as owner),
and local, CI and the e2e suites running as `coco_app`, so every change is
tested against the policies from now on. Activating is one reversible
environment change, steps 5–7 of `docs/rls-rollout.md`.

**When to activate:** re-measure on an idle machine once #27 and this step are
both in `Dev`; if the full-range dashboard p95 with RLS is at or under the
budget —or the budget is revised for that range— run steps 5–7. Cheaper
units (one per request for the other heavy screens) are the lever if it is
not.

## Consequences

- Good: the database is a second lock, proven by `row-level-security.e2e-spec.ts`
  (reads, writes and inserts with no owner filter; a query outside any unit;
  the audit log; the definer function), and every e2e suite runs under it.
- Good: a repository that bypasses `forUser` fails a unit test before review.
- Bad: every user query is a transaction: +1 to +3 ms p50 locally, more in
  production, until units are grouped per request.
- Bad: the owner role must keep `BYPASSRLS`, and a `pg_dump` restore needs
  `coco_app` to exist first (the policies name it).
- The `users` table has no per-user policy; a forgotten filter there is caught
  only by the first lock. Revisit if a non-admin route ever lists users.
