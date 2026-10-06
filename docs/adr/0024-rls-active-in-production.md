# 0024 — Row-level security is active in production

- Status: accepted
- Date: 2026-10-05 (step 7.11-b-prod)
- Deciders: the owner (activate), phase 7
- Supersedes the "prepared, not activated" outcome of
  [0019](0019-rls-for-user-cross-user-paths-and-cost.md); the design there
  (`forUser`, the policies, the definer function) stands.

## Context and problem statement

0019 left row-level security prepared but inert: the full-range dashboard p95
with RLS measured 60.7 ms against the 50 ms budget of 7.9, on a busy machine
and before the dashboard history fix (#27) and Prisma 7 were in. The owner
decided to activate it. Two questions were left: what it costs now, on the
code that will run, and what the app role may still do to `users`, which 0019
left open to any `UPDATE`.

## Decision outcome

**RLS is active.** Production connects as `coco_app` (`DATABASE_URL`);
migrations keep running as the owner (`DIRECT_URL`). Procedure and its undo:
`docs/runbook.md`, "Row-level security".

**The budget is not raised.** Measured on the code that ships (Dev + #31 +
Prisma 7, the dashboard in one unit of work), every endpoint is under 50 ms
p95, the full-range dashboard included (26.7 ms).

**`users`: column privileges** (`20261006000300_users_column_privileges`).
`coco_app` may `UPDATE` only `last_login_at`, `sessions_valid_from` and
`updated_at`, the columns the API writes (login, revoke every session). The
role, the status and the approval stamp change only through
`app_private.set_user_access(target, status, role, approve)`, a SECURITY
DEFINER function that refuses unless the unit of work runs as an active admin
(`app.current_user_id`, set by `forUser`): the actor is not a parameter, so a
caller can only act as itself. `UsersRepository.setAccess` is its one caller;
`AdminService` keeps the business rules (not on yourself, keep one admin).

### The cost, measured

`scripts/perf/api-bench.mjs`, local Postgres 17, `bench-db.sh create --long`
(2,045 movements) plus the four RLS migrations, 200 timed requests after 20
warmups, median of 5 interleaved rounds. A = `Dev` before this step (Prisma 6,
no `forUser`), as owner. B = the code that ships, as owner (policies
bypassed). C = the code that ships, as `coco_app`. The bench now finds its
user and cleans up through the owner (`pg`), so it can run the API as
`coco_app` (`COCO_BENCH_APP_DATABASE_URL`).

| Endpoint (ms)                           | p50 A | p50 B | p50 C | p95 A | p95 B | p95 C    |
| --------------------------------------- | ----- | ----- | ----- | ----- | ----- | -------- |
| GET /dashboard (current month)          | 6.7   | 4.8   | 5.0   | 15.1  | 8.8   | 7.8      |
| GET /dashboard (2000-01-01..2026-12-31) | 23.8  | 14.5  | 14.8  | 38.5  | 24.4  | **26.7** |
| GET /transactions (page 1, 25, -date)   | 2.7   | 4.3   | 5.4   | 4.9   | 6.1   | 8.9      |
| GET /transactions (per_page=200)        | 6.7   | 6.8   | 7.5   | 14.2  | 14.0  | 13.3     |
| POST /transactions/capture (manual)     | 5.0   | 4.2   | 5.1   | 8.0   | 7.4   | 10.2     |
| POST /transactions/capture (SMS)        | 6.1   | 5.5   | 6.0   | 9.6   | 10.0  | 9.2      |

- The policies still cost about nothing (B ≈ C); a single-query endpoint pays
  the unit of work, +1 to +3 ms p50, as in 0019.
- The dashboard got FASTER than before RLS: its six reads share one unit, and
  Prisma 7's driver adapter is cheaper per query than the Rust engine.
- The machine was not idle (load 12–15, iCloud syncing the repository); the
  rounds were interleaved so the noise hit A, B and C alike.
- In production every round trip goes to the Supabase pooler; the per-unit
  cost grows with that latency. One unit per request on the other heavy
  screens is the lever if a production p95 says so.

## Consequences

- Good: the database is the second lock in production, not only in tests.
- Good: an injection or a bug through the app role can no longer make anyone
  an admin or reactivate a suspended account.
- Bad: inserting into `users` is still open to the app role (registration
  writes the role and status of the bootstrap admin); narrowing it needs the
  same definer treatment.
- The owner (`postgres` in Supabase) must keep `BYPASSRLS`: with `FORCE` it
  would otherwise see no rows. Checked before activating.
